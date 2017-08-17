var Accessory, Service, Characteristic;
var broadlink = require('broadlinkjs-sm');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-broadlink-platform", "broadlinkPlatform", broadlinkPlatform);
}

function broadlinkPlatform(log, config, api) {
    this.log = log;
    this.config = config;

    if (api) {
        this.api = api;
    }

}

broadlinkPlatform.prototype = {
    accessories: function(callback) {
        //For each device in cfg, create an accessory!
        var foundAccessories = this.config.accessories;
        var myAccessories = [];

        for (var i = 0; i < foundAccessories.length; i++) {
            if (foundAccessories[i].type == "MP") {
                for (var a = 1; a <= 4; a++) {
                    foundAccessories[i].sname = "s" + a;
                    var accessory = new BroadlinkAccessory(this.log, foundAccessories[i]);
                    myAccessories.push(accessory);
                    this.log('Created ' + accessory.name + ' ' + accessory.sname + ' Accessory');
                }
            } else {
                var accessory = new BroadlinkAccessory(this.log, foundAccessories[i]);
                myAccessories.push(accessory);
                this.log('Created ' + accessory.name + ' Accessory');
            }
        }
        callback(myAccessories);
    }
}

function BroadlinkAccessory(log, config) {
    this.log = log;
    this.config = config;
    this.sname = config.sname || "";
    this.type = config.type || "MP";
    this.name = (this.type == "MP" ? (config.name + " " + this.sname) : config.name);
    this.ip = config.ip;
    this.mac = config.mac;
    this.powered = false;
    this.local_ip_address = config.local_ip_address;

    if (!this.ip && !this.mac) throw new Error("You must provide a config value for 'ip' or 'mac'.");

    // MAC string to MAC buffer
    this.mac_buff = function(mac) {
        var mb = new Buffer(6);
        if (mac) {
            var values = mac.split(':');
            if (!values || values.length !== 6) {
                throw new Error('Invalid MAC [' + mac + ']; should follow pattern ##:##:##:##:##:##');
            }
            for (var i = 0; i < values.length; ++i) {
                var tmpByte = parseInt(values[i], 16);
                mb.writeUInt5(tmpByte, i);
            }
        } else {
            //this.log("MAC address emtpy, using IP: " + this.ip);
        }
        return mb;
    }
}

BroadlinkAccessory.prototype = {
    getServices: function() {
        var type = this.config.type;
        var services = [];
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink');

        if (type == 'SP') {
            var switchService = new Service.Switch(this.name);
            switchService
                .getCharacteristic(Characteristic.On)
                .on('get', this.getSPState.bind(this))
                .on('set', this.setSPState.bind(this));

            informationService
                .setCharacteristic(Characteristic.Model, 'SP')
                .setCharacteristic(Characteristic.SerialNumber, '1.0');

            services.push(switchService, informationService);

        } else if (type == 'MP') {
            var switchService = new Service.Switch(this.sname);
            switchService
                .getCharacteristic(Characteristic.On)
                .on('get', this.getMPstate.bind(this))
                .on('set', this.setMPstate.bind(this));

            informationService
                .setCharacteristic(Characteristic.Model, 'MP')
                .setCharacteristic(Characteristic.SerialNumber, this.sname);

            services.push(switchService, informationService);

        }

        return services;
    },

    // b: broadlink
    discover: function(b) {
        b.discover(this.local_ip_address);
    },

    getSPState: function(callback) {
        var self = this;
        var b = new broadlink();
        self.discover(b);
        var counterSPget = 0
        self.log("Checking status for " + self.name + "...")
        b.on("deviceReady", (dev) => {
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                dev.check_power();
                clearInterval(checkAgainSP)
                counterSPget = 0
                //self.log("Checking status for " + self.name + "...")
                var checkPowerAgainSP = setInterval(function() {
                    //self.log("Trying to check power (" + counterSPget + ") " + self.name)
                    dev.check_power();
                }, Math.floor(Math.random() * 1000 + 1000))
                dev.on("power", (pwr) => {
                    clearInterval(checkPowerAgainSP);
                    self.log(self.name  + " power is " + (pwr == true ? "ON" : "OFF"));
                    dev.exit();
                    if (!pwr) {
                        self.powered = false;
                        return callback(null, false);
                    } else {
                        self.powered = true;
                        return callback(null, true);
                    }
                });
            } else {
                dev.exit();
            }
        });
        var checkAgainSP = setInterval(function() {
            if (counterSPget < 5) {
                //self.log("Trying to get status (" + counterSPget + ") " + self.name)
                self.discover(b);
            } else {
                clearInterval(checkAgainSP)
                var err = new Error("Coudn't retrieve status from " + self.name)
                self.log("Coudn't get status from " + self.name)
                callback(err, null)
            }
            counterSPget ++;

        }, Math.floor(Math.random() * 1000 + 1000)

    },

    setSPState: function(state, callback) {
        var self = this;
        var b = new broadlink();
        self.discover(b);

        self.log("Set " + self.name + " state: " + state);
        if (state) {
            if (self.powered) {
                return callback(null, true)
            } else {
                b.on("deviceReady", (dev) => {
                    if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                        self.log(self.name + "is ON!");
                        counterSPset = 0;
                        clearInterval(checkAgainSPset)
                        dev.set_power(true);
                        dev.exit();
                        self.powered = true;
                        return callback(null, true);
                    } else {
                        dev.exit();
                    }
                });
                var checkAgainSPset = setInterval(function() {
                    if (counterSPset < 5) {
                        self.discover(b);
                    } else {
                        clearInterval(checkAgainSPset)
                        var err = new Error("Coudn't set status for " + self.name)
                        self.log("Coudn't set status for " + self.name)
                        callback(err, null)
                    }
                    counterSPset ++;
                }, Math.floor(Math.random() * 2000 + 1000))
            }
        } else {
            if (self.powered) {
                b.on("deviceReady", (dev) => {
                    if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                        self.log(self.name + "is OFF!");
                        counterSPset = 0;
                        clearInterval(checkAgainSPset)
                        dev.set_power(false);
                        dev.exit();
                        self.powered = false;
                        return callback(null, false);
                    } else {
                        dev.exit();
                    }
                });
                var checkAgainSPset = setInterval(function() {
                    if (counterSPset < 5) {
                        self.discover(b);
                    } else {
                        clearInterval(checkAgainSPset)
                        var err = new Error("Coudn't set status for " + self.name)
                        self.log("Coudn't set status for " + self.name)
                        callback(err, null)
                    }
                    counterSPset ++;
                }, Math.floor(Math.random() * 2000 + 1000))
            } else {
                return callback(null, false)
            }
        }
    },

    getMPstate: function(callback) {
        var self = this;
        var b = new broadlink();
        var s_index = self.sname[1];
        var counterMPget = 0;
        self.log("checking status for " + self.name + "...")
        self.discover(b);
        b.on("deviceReady", (dev) => {
            //self.log("detected device type:" + dev.type + " @ " + dev.host.address);
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                //self.log("deviceReady for " + self.name);
                clearInterval(checkAgainMP)
                counterMPget = 0
                dev.check_power();
                var checkPowerAgainMP = setInterval(function() {
                    //self.log("Trying to check power (" + counterSPget + ") " + self.name)
                    dev.check_power();
                }, Math.floor(Math.random() * 1000 + 1000))
                dev.on("mp_power", (status_array) => {
                    clearInterval(checkPowerAgainMP);
                    //self.log("Status is ready for " + self.name);
                    self.log(self.name + " power is " + (status_array[s_index - 1] == true ? "ON" : "OFF"));
                    dev.exit();
                    if (!status_array[s_index - 1]) {
                        self.powered = false;
                        return callback(null, false);
                    } else {
                        self.powered = true;
                        return callback(null, true);
                    }
                });

            } else {
                dev.exit();
                //self.log("exited device type:" + dev.type + " @ " + dev.host.address);
            }
        });
        var checkAgainMP = setInterval(function() {
            if (counterMPget < 5) {
                self.discover(b);
            } else {
                clearInterval(checkAgainMP);
                var err = new Error("Coudn't retrieve status from " + self.name)
                self.log("Coudn't get status from " + self.name)
                callback(err, null)
            }
            counterMPget ++;
        }, Math.floor(Math.random() * 1000 + 1000))


    },

    setMPstate: function(state, callback) {
        var self = this;
        var s_index = self.sname[1];
        var b = new broadlink();
        var counterMPset = 0;
        self.log("Set " + self.name + " state: " + state);
        if (state) {
            if (self.powered) {
                return callback(null, true);
            } else {
                self.discover(b);
                b.on("deviceReady", (dev) => {
                    if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                        self.log(self.name + " is ON!");
                        dev.set_power(s_index, true);
                        dev.exit();
                        counterMPset = 0;
                        clearInterval(checkAgainSet);
                        self.powered = true;
                        return callback(null, true);
                    } else {
                        dev.exit();
                    }
                });
                var checkAgainSet = setInterval(function() {
                    if (counterMPset < 5) {
                        self.discover(b);
                    } else {
                        clearInterval(checkAgainSet);
                        var err = new Error("Coudn't set status for " + self.name)
                        self.log("Coudn't set status for " + self.name)
                        callback(err, null)
                    }
                    counterMPset ++;
                }, Math.floor(Math.random() * 2000 + 1000))
            }
        } else {
            if (self.powered) {
                self.discover(b);
                b.on("deviceReady", (dev) => {
                    if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                        self.log(self.name + " is OFF!");
                        dev.set_power(s_index, false);
                        dev.exit();
                        counterMPset = 0;
                        clearInterval(checkAgainSet);
                        self.powered = false;
                        return callback(null, false);
                    } else {
                        dev.exit();
                    }
                });
                var checkAgainSet = setInterval(function() {
                    if (counterMPset < 5) {
                        self.discover(b);
                    } else {
                        clearInterval(checkAgainSet);
                        var err = new Error("Coudn't set status for " + self.name)
                        self.log("Coudn't set status for " + self.name)
                        callback(err, null)
                    }
                    counterMPset ++;
                }, Math.floor(Math.random() * 2000 + 1000))
            } else {
                return callback(null, false)
            }
        }
    }
}
