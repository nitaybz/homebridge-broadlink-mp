var Accessory, Service, Characteristic;
var broadlink = require('./lib/broadlinkjs');

const getDevice = require('./lib/getDevice');

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
                    this.log('Created ' + accessory.name + ' Accessory');
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
    this.mpName = config.name
    if (!this.ip && !this.mac) throw new Error("You must provide a config value for 'ip' or 'mac'.");

    
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
            var switchService = new Service.Switch(this.name);
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

    getSPState: function(callback) {
        var host = this.ip || this.mac
        var log = this.log
        this.device = getDevice({ host, log })
        var self = this;
        var counter = 0;
        if (this.device == undefined && counter < 10){
            counter++
            this.log("Searching for " + this.name  + " device... Please Wait!")
            setTimeout(function(){
                self.getSPState(callback)
            }, 3000)
        } else if (this.device == undefined && counter >= 10){
            var err = new Error("Could not find " + self.name + " at " + host + " !")
            self.log(err)
            callback(err, null)
        } else {
            this.device.check_power(function(pwr){
                self.log(self.name  + " power is " + (pwr == true ? "ON" : "OFF"));
                if (!pwr) {
                    callback(null, false);
                } else {
                    callback(null, true);
                }
            });
        }
    },


    setSPState: function(state, callback) {
        var host = this.ip || this.mac
        var log = this.log
        this.device = getDevice({ host, log })
        var counter = 0;
        if (this.device == undefined && counter < 10){
            counter++
            this.log("Searching for " + this.name  + " device... Please Wait!")
            setTimeout(function(){
                self.setSPState(state, callback)
            }, 3000)
        } else if (this.device == undefined && counter >= 10){
            var err = new Error("Could not find " + self.name + " at " + host + " !")
            self.log(err)
            callback(err, null)
        } else {
            this.log("Set " + this.name + " state: " + state);
            this.device.set_power(state);
            callback(null, state);
        }
    },

    getMPstate: function(callback) {
        var host = this.ip || this.mac
        var log = this.log
        this.device = getDevice({ host, log })
        var self = this;
        var s_index = this.sname[1];
        var counter = 0;
        if (this.device == undefined && counter < 10){
            counter++
            if (s_index == 1){
                this.log("Searching for " + this.mpName + " device... Please Wait!")
            }
            setTimeout(function(){
                self.getMPstate(callback)
            }, 3000)
        } else if (this.device == undefined && counter >= 10){
            var err = new Error("Could not find " + self.name + " at " + host + " !")
            self.log(err)
            callback(err, null)
        } else {
            var gotPower = false;
            self.device.check_power(function(status_array){
                gotPower = true;
                self.log(self.name + " power is " + (status_array[s_index - 1] == true ? "ON" : "OFF"));
                if (!status_array[s_index - 1]) callback(null, false)
                else callback(null, true);
            });
            var intervalCounter = 0;
            var intervalPowerCheck = setInterval(function(){
                if (gotPower == true) clearInterval(intervalPowerCheck)
                else {
                    if (intervalCounter < 5) {
                        counter ++;
                        self.device.check_power(function(status_array){
                            gotPower = true;
                            self.log(self.name + " power is " + (status_array[s_index - 1] == true ? "ON" : "OFF"));
                            if (!status_array[s_index - 1]) callback(null, false)
                            else callback(null, true);
                        });
                    } else {
                        clearInterval(intervalPowerCheck)
                        var err = new Error("Could not get status from " + self.name)
                        self.log(err)
                        callback(err)
                    }
                }
                
            }, 3000)
        }
    },

    setMPstate: function(state, callback) {
        var s_index = this.sname[1];
        var host = this.ip || this.mac
        var log = this.log
        var self = this
        this.device = getDevice({ host, log })
        var counter = 0;
        if (this.device == undefined && counter < 10){
            counter++
            if (s_index == 1){
                this.log("Searching for " + this.mpName + " device... Please Wait!")
            }
            setTimeout(function(){
                self.setMPstate(state, callback)
            }, 3000)
        } else if (this.device == undefined && counter >= 10){
            var err = new Error("Could not find " + self.name + " at " + host + " !")
            self.log(err)
            callback(err, null)
        } else {
            this.log("Set " + this.name + " state: " + state);
            this.device.set_power(s_index, state);
            callback(null, state);
        }
    }
}
