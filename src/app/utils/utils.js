var AWS = require('../cloud/aws.js');
var tunnels ={};
var Q = require('q');

module.exports = {
    createUrl: function (s, app) {
        if (this.getPort(s, app)) {
            return `${this.getProtocol(s, app)}://${this.getHost(s, app)}:${this.getPort(s, app)}`;
        } else {
            return `${this.getProtocol(s, app)}://${this.getHost(s, app)}`;
        }
    },
    getPort: function (s, app) {
        if (s._tunnel && this.isForwardConnection(s))
            return s._tunnel.localPort;
        return app.port;
    },
    getHost: function (s, app) {
        if (this.isTerminalType(app)) {
            return __dirname + "/../term/index.html";
        } else {
            return (s._tunnel && this.isForwardConnection(s)) ? "localhost" : this.getRemoteAddr(s);
        }
    },
    getRemoteAddr: function(s){
        if(s.type=='generic'){
            return s.generic.host;
        }else if(s.type == 'aws'){
            return AWS.getHostName(s.aws.instance);
        }
    },
    getProtocol: function (s, app) {
        if (this.isTerminalType(app)) {
            return "file";
        }
        return app.protocol || "http";
    },
    getInstanceName: function(i){
        if(i.type == 'generic'){
            return i.generic.name;
        }else if(i.type == 'aws'){
            return AWS.getName(i.aws.instance);
        }
    },
    getSSH: function(i, db, sshConfig){
        var id = db.getUniqueId(i);
        if(tunnels[id])
            return tunnels[id];
        if(sshConfig){
            return tunnels[id] = new SSHTunnel(sshConfig);
        }
    },
    initSSH: function(s, app, db){
        var lastSSH, i = s;
        var instances = (this.isTerminalType(app) || this.isScullogType(app))?[s]:[];
        while(i = i.connection.ref){
            i = db.getInstance(i);
            instances.push(i);
        }
        while(i=instances.pop()){
            var instance = i;
            var sshApp = instance.applications.filter(function(a){
                return utils.isTerminalType(a);
            })[0];
            var sshConfig = {username:sshApp.config.userName, host: this.getRemoteAddr(instance), port: sshApp.port};
            if(sshApp.config.secret.key == 'password'){
                sshConfig.password = sshApp.config.secret.password
            }else{
                sshConfig.identity = sshApp.config.secret.pem.file.path;
            }
            if(!lastSSH){
                lastSSH = this.getSSH(instance, db, sshConfig).connect(sshConfig);
            }else {
                lastSSH = lastSSH.then((ssh) => {
                    return ssh.spawnCmd(`nc ${this.getRemoteAddr(instance)} ${sshApp.port}`);
                }).then((stream) => {
                    sshConfig.sock = stream;
                    return this.getSSH(instance, db, sshConfig).connect(sshConfig);
                })
            }
        }
        return Q.when(lastSSH);
    },
    createCouchUrl: function (s, app) {
        return `${app.protocol}://localhost:${s._couch.port}`;
    },
    createScullogUrl: function (s) {
        return `http://localhost:${s._scullog.port}`;
    },
    createProxyUrl: function (port) {
        return `socks5://localhost:${port}`;
    },
    isCouchDBType: function (app) {
        return app.type === "couchdb"
    },
    isTerminalType: function (app) {
        return app.type === "ssh"
    },
    isScullogType: function (app) {
        return app.type === "scullog"
    },
    isForwardConnection: function (s) {
        return s.connection && s.connection.type === "forward";
    },
    isSocksConnection: function (s) {
        return s.connection && s.connection.type === "socks";
    },
    isDirectConnection: function (s) {
        return s.connection && s.connection.type === "direct";
    }
}