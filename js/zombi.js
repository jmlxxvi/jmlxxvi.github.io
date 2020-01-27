const ZOMBI = (() => {

    const me = this;

    var seq = 0;

    var radio_stations = [];
    var radio_device_counter = 0;

    var console_log_keep_data = [];

    var ws_client = null;
    var ws_callbacks = {};

    var state_data = {};

    _local_storage = (key, value) => {
        if(typeof value === "undefined") { return localStorage.getItem(key); }
        else if(value === null) { localStorage.removeItem(key); }
        else { localStorage.setItem(key, value); }
    };

    return {

        log(message, context = "UNKNOWN") {

            const time = (new Date().toISOString().split("T")[1]).replace("Z", "");
            
            if(ZOMBI.config("CONSOLE_LOG_ENABLED")) { 
                
                console.log(`${time} ${context}: ${message}`); 
            
            }

            if(ZOMBI.config("CONSOLE_LOG_KEEP_ENABLED")) {

                console_log_keep_data.unshift([ZOMBI.sequence(), time, message, context]);

                if (console_log_keep_data.length > ZOMBI.config("CONSOLE_LOG_KEEP_MAX_SIZE")) { console_log_keep_data.pop(); }

            }
        
        },

        get_log() {

            return console_log_keep_data;

        },

        sequence() { return seq++; },

        config(key) {
            
            if(zombiConfig.hasOwnProperty(key) && typeof zombiConfig[key] !== 'undefined') {
                
                return zombiConfig[key];
                
            } else { return null; }
                
        },

        make_token_shorter (token) { 
    
            if(!!token) {
        
                return token.substr(0, 10) + "..." + token.substr(-10); 
        
            } else {
        
                return "none";
        
            }
        
        },

        token(token) { return me._local_storage("zombi_token", token) },

        fullname(fullname) { return me._local_storage("zombi_fullname", fullname) },

        timezone(tz) { return me._local_storage("zombi_timezone", tz) },

        language(lang) { return me._local_storage("zombi_language", lang) },

        state: {

            set(key, value) {

                let current_state = {};

                Object.assign(current_state, state_data); // We return the previous state below

                state_data[key] = value;

                ZOMBI.log(`State for key ${key} changed to ${JSON.stringify(value)}`, "STATE");

                ZOMBI.radio.emit("ZOMBI_STATE_CHANGE", { key, value, state_data });

                return current_state;

            },
 
            get(key) { if(state_data[key]) { return state_data[key]; } else { return null; } },

            data() { return state_data; },

            clear() { state_data = {}; ZOMBI.radio.emit("ZOMBI_STATE_CHANGE", { key: null, value: null, state_data }); }

        },

        ws: {

            close() { ws_client.close(); },

            connect(keep = true) {

                if(ZOMBI.config("SOCKETS_CONNECT_ENABLED")) {

                    const token = ZOMBI.token();

                    if(token === null) {
    
                        ZOMBI.log("Token not set, reconnecting later", "SOCKETS");
    
                        setTimeout(() => { ZOMBI.ws.connect(); }, ZOMBI.config("SOCKETS_RECCONNECT_TIME"));
    
                    } else if (keep && ws_client.readyState && ws_client.readyState === 1) {

                        ZOMBI.log("Already connected to server", "SOCKETS");
    
                    } else {

                        const protocol = (location.protocol === "http:") ? "ws:" : "wss:" ;

                        const url = `${protocol}//${location.hostname}:${location.port}?token=${ZOMBI.token()}`;
    
                        ZOMBI.log("Connecting to " + url, "SOCKETS");
    
                        ws_client = new WebSocket(url);
    
                        ws_client.onopen = () => {

                            ZOMBI.radio.emit("ZOMBI_SERVER_SOCKET_CONNECTED");

                            ZOMBI.log("Connected", "SOCKETS");
                        
                        };

                        ws_client.onclose = event => {

                            ZOMBI.radio.emit("ZOMBI_SERVER_SOCKET_DISCONNECTED");

                            const reconnect_time = ZOMBI.config("SOCKETS_RECCONNECT_TIME");
    
                            ZOMBI.log(`Socket is closed. Reconnect will be attempted in ${reconnect_time} milliseconds: ${event.reason}`, "SOCKETS");
    
                            setTimeout(() => { ZOMBI.ws.connect(); }, reconnect_time);
                
                        };

                        ws_client.onmessage = event => {

                            ZOMBI.log("Message: " + event.data, "SOCKETS");
    
                            if(event.data.substring(0, 4) === "ping") { // Server sent hertbeat ping

                                if (ws_client && ws_client.readyState && ws_client.readyState === 1) {

                                    ZOMBI.log("Server sent ping, answering with pong", "SOCKETS");
    
                                    ws_client.send("pong");

                                } else {

                                    ZOMBI.log("Cannot answer ping, not connected", "SOCKETS");

                                }

                            } else {

                                const data = JSON.parse(event.data);

                                ZOMBI.radio.emit("ZOMBI_SERVER_SOCKET_RECEIVE", data);
    
                                if(data.error && data.message) { // Message is a response to a user request because there is no context
            
                                    if(ws_callbacks[data.info.sequence]) {

                                        ws_callbacks[data.info.sequence](data);

                                        // TODO this is to prevent ws_callbacks to leak. There may be a better solution...
                                        setTimeout(() => { delete ws_callbacks[data.info.sequence]; }, 0);
                                    
                                    }
            
                                }
                                
                            }
    
                        };

                        ws_client.onerror = event => {

                            ZOMBI.log("Connection error", "SOCKETS");
    
                        };

                    }

                } else {

                    ZOMBI.log("IO: Connection disabled on config", "SOCKETS");

                }

            },

            send(params, callback) {

                const base = {
                    token: ZOMBI.token(),
                    mod: "",
                    fun: "",
                    args: {},
                    config: {},
                    sequence: ZOMBI.sequence()
                };
    
                const smarap = (ZOMBI.utils.is_array(params)) ? {mod: params[0], fun: params[1], args: params[2]} : params; 
                
                const merged = ZOMBI.utils.extend(true, base, smarap);
    
                if(typeof callback === "function") { ws_callbacks[sequence] = callback; }

                ws_client.send(JSON.stringify(merged));

                ZOMBI.radio.emit("ZOMBI_SERVER_SOCKET_SEND", merged);
    
                return merged;
                
            }

        },

        server(params, callback) {

            if(typeof callback === "function") {

                return ZOMBI._exec(params, callback);

            } else {

                return new Promise((resolve, reject) => { 
                    
                    ZOMBI._exec(params, (err, res) => {

                        if(err) {

                            reject(err);

                        } else {

                            resolve(res);

                        }

                    });

                });

            }

        },
        
        _exec(params, callback) {

            const base = {
                token: ZOMBI.token(),
                mod: "",
                fun: "",
                args: {},
                config: {},
                sequence: ZOMBI.sequence()
            };

            const smarap = (ZOMBI.utils.is_array(params)) ? {mod: params[0], fun: params[1], args: params[2]} : params; 
            
            const merged = ZOMBI.utils.extend(true, base, smarap);

            ZOMBI.radio.emit("ZOMBI_SERVER_CALL_START", [merged.mod, merged.fun]);

            axios({
                method: 'post',
                url: `${ZOMBI.config("SERVER_PATH")}`,
                data: JSON.stringify(merged),
                responseType: 'json',
                responseEncoding: 'utf8',
                headers: {'Content-Type': 'application/json'},
                validateStatus: () => { return true; } // Zombi doesn't care about HTTP codes that much
            }).then((response) => {

                if(
                    typeof response.data === "undefined" || 
                    typeof response.data.error === "undefined" ||
                    typeof response.data.code === "undefined" ||
                    typeof response.data.data === "undefined" ||
                    typeof response.data.message === "undefined"
                ) {

                    if(typeof callback === "function") { 
                        callback({
                            error: true,
                            code: 602,
                            message: `Malformed response from server`,
                            data: null
                        }); 
                    }

                } else {

                    if(response.data.code === 1001) {

                        ZOMBI.radio.emit("ZOMBI_SERVER_SESSION_EXPIRED");
    
                    } else {
    
                        if(typeof callback === "function") { callback(response.data); }
    
                    }

                }

                ZOMBI.radio.emit("ZOMBI_SERVER_CALL_TRAFFIC", {sequence: merged.sequence, request: merged, response: response.data});

            }).catch(error => {

                if (error.request) { // The request was made but no response was received. `error.request` is an instance of XMLHttpRequest

                    if(typeof callback === "function") {
                        callback({
                            error: true,
                            code: 600,
                            message: `Server error: ${error.message}`,
                            data: null
                        });
                    }

                    ZOMBI.radio.emit("ZOMBI_SERVER_CALL_TRAFFIC", {sequence: merged.sequence, request: merged, response: `Server error: ${error.message}`});

                } else { // Something happened in setting up the request that triggered an Error

                    if(typeof callback === "function") {
                        callback({
                            error: true,
                            code: 601,
                            message: `Request error`,
                            data: null
                        });
                    }

                    ZOMBI.radio.emit("ZOMBI_SERVER_CALL_TRAFFIC", {sequence: merged.sequence, request: merged, response: `Request error: ${error.message}`});
                }
                
            }).then(() => { // This extra .then() works the same way as jquery's "always"
                
                ZOMBI.radio.emit("ZOMBI_SERVER_CALL_FINISH", [merged.mod, merged.fun]);

            });

            return merged;
            
        },

        radio: {

            turnon(station, func, listener = null) {

                if (!radio_stations[station]) { radio_stations[station] = []; }

                var radio_device_id = (++radio_device_counter).toString();

                if(ZOMBI.radio._check_exists(station, "listener", listener)) {

                    ZOMBI.log(`RADIO: The listner ${listener} is already listening to ${station}`);

                } else {

                    radio_stations[station].push({

                        radio_device_id: radio_device_id,
    
                        func: func,
    
                        listener: listener
    
                    });

                    const who_is_listening = (listener === null) ? radio_device_id : listener;

                    ZOMBI.log(`Receptor ${who_is_listening} is now listening to station ${station}`, "RADIO");

                }

                return radio_device_id;

            },

            emit(station, music = null) {

                const sequence = ZOMBI.sequence();

                if (!radio_stations[station]) {

                    ZOMBI.log(`Nobody is listening to station ${station}`, "RADIO");

                    return false;

                }

                setTimeout(function() {

                    let subscribers = radio_stations[station],
                        len = subscribers ? subscribers.length : 0;

                    while (len--) {

                        subscribers[len].func(music);

                        const who_is_listening = (subscribers[len].listener === null) ? subscribers[len].radio_device_id : subscribers[len].listener;

                        ZOMBI.log(`Station ${station} is emiting the music ${music} to receptor ${who_is_listening}`, "RADIO");

                    }

                }, 0);

            },

            turnoff(radio_device_id) {

                for (var m in radio_stations) {

                    if (radio_stations[m]) {

                        for (var i = 0, j = radio_stations[m].length; i < j; i++) {

                            if (radio_stations[m][i].radio_device_id === radio_device_id) {

                                ZOMBI.log(`Device ${radio_device_id} is not listening to station ${m} anymore`, "RADIO");

                                radio_stations[m].splice(i, 1);

                                return radio_device_id;

                            }

                        }

                    }

                }

            },

            _check_exists(station2add, what, thing) {

                let it_does = false;

                for (const station in radio_stations) {

                    if (radio_stations[station]) {

                        const j = radio_stations[station].length;

                        for (let i = 0; i < j; i++) {

                            if (station === station2add && radio_stations[station][i][what] === thing) {

                                it_does = true;

                            }

                        }

                    }

                }

                return it_does;

            },

        },

        utils: {

            extend () {

                // Variables
                var extended = {};
                var deep = false;
                var i = 0;
                var length = arguments.length;
            
                // Check if a deep merge
                if ( Object.prototype.toString.call( arguments[0] ) === '[object Boolean]' ) {
                    deep = arguments[0];
                    i++;
                }
            
                // Merge the object into the extended object
                var merge = function (obj) {
                    for ( var prop in obj ) {
                        if ( Object.prototype.hasOwnProperty.call( obj, prop ) ) {
                            // If deep merge and property is an object, merge properties
                            if ( deep && Object.prototype.toString.call(obj[prop]) === '[object Object]' ) {
                                extended[prop] = ZOMBI.utils.extend( true, extended[prop], obj[prop] );
                            } else if(typeof obj[prop] !== "undefined") {
                                extended[prop] = obj[prop];
                            }
                        }
                    }
                };
            
                // Loop through each object and conduct a merge
                for ( ; i < length; i++ ) {
                    var obj = arguments[i];
                    merge(obj);
                }
            
                return extended;
            
            },

            is_empty(thing) {

                return (
                    typeof thing === "undefined" || 
                    thing === "" || 
                    thing === null || 
                    thing === "null" || 
                    thing === "false" || 
                    ( // Empty array
                        ZOMBI.utils.is_array(thing) &&
                        thing.length === 0
                    ) || 
                    thing === 0 ||
                    thing === "0" ||
                    ( // Empty object
                        typeof thing === "object" &&
                        Object.keys(thing).length === 0 &&
                        thing.constructor === Object
                    )
                );
            
            },
            
            is_array(thing) {
            
                return thing instanceof Array || Object.prototype.toString.call(thing) === '[object Array]';
            
            },
            
            is_object(thing) {
            
                return thing && typeof thing === 'object' && thing.constructor === Object;
            
            }

        },

    };

})();


/*
    Axios Response Schema
    {
        data: {}, // `data` is the response that was provided by the server
        status: 200, // `status` is the HTTP status code from the server response
        statusText: 'OK', // `statusText` is the HTTP status message from the server response
        headers: {}, //`headers` the headers that the server responded with. All header names are lower cased
        config: {}, // `config` is the config that was provided to `axios` for the request
        request: {} // `request` is the request that generated this response (XMLHttpRequest instance the browser)
    }
*/
