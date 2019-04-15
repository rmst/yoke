'use strict';
// those 3 are recommended for non-kiosk/non-embedded browsers
var WAIT_FOR_FULLSCREEN = true;
var DEBUG_NO_CONSOLE_SPAM = true;

var VIBRATION_MILLISECONDS_IN = 50;
var VIBRATION_MILLISECONDS_OUT = 50;
var ACCELERATION_CONSTANT = 0.025;

//
// MISCELLANEOUS HELPER FUNCTIONS
//
function prettyAlert(message) {
    var warningDiv = document.getElementById('warning');
    warningDiv.innerHTML = message + '<p class=\'dismiss\'>Tap to dismiss.</p>';
    warningDiv.style.display = 'inline';
}

// https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates#14438954
function unique(value, index, self) {
    return self.indexOf(value) === index;
}

function mnemonics(a, b) {
    var callback, ids;
    if (typeof b == 'function') {
        // if b is a callback function, mnemonics() chooses the correct control for the joypad
        callback = b;
        ids = [a];
    } else {
        // if b is a string, mnemonics() serves as a custom sorting algorithm
        callback = null;
        ids = [a, b];
    }
    var sortScores = ids.slice();
    // sortScores contains arbitrary numbers.
    // These only matter if mnemonics() is being used as a sort function;
    // the lower-ranking controls are attached earlier.
    ids.forEach(function(id, i) {
        if (id == 'dbg') { sortScores[i] = 998; } else {
            sortScores[i] = 997;
            switch (id[0]) {
                case 's':
                case 'j':
                    // 's' is a locking joystick, 'j' - non-locking
                    if (typeof callback == 'function') {
                        sortScores[i] = new Joystick(id, callback);
                    } else { sortScores[i] = 100; }
                    break;
                case 'm':
                    if (typeof callback == 'function') {
                        sortScores[i] = new Motion(id, callback);
                    } else {
                        sortScores[i] = 200;
                        switch (id[1]) {
                            case 'x': sortScores[i] += 0; break;
                            case 'y': sortScores[i] += 10; break;
                            case 'z': sortScores[i] += 20; break;
                            case 'a': sortScores[i] += 30; break;
                            case 'b': sortScores[i] += 40; break;
                            case 'g': sortScores[i] += 50; break;
                            default:
                                prettyAlert('Motion detection error: \
                              Unrecognised coordinate <code>' + id[1] + '</code>.');
                                break;
                        }
                    }
                    break;
                case 'p':
                    if (typeof callback == 'function') {
                        sortScores[i] = new Pedal(id, callback);
                    } else { sortScores[i] = 300; }
                    break;
                case 'k':
                    if (typeof callback == 'function') {
                        sortScores[i] = new Knob(id, callback);
                    } else { sortScores[i] = 400; }
                    break;
                case 'b':
                    if (typeof callback == 'function') {
                        sortScores[i] = new Button(id, callback);
                    } else { sortScores[i] = 600; }
                    break;
                case 'd':
                    if (typeof callback == 'function') {
                        sortScores[i] = new Button(id, callback);
                    } else {
                        sortScores[i] = 700;
                        switch (id.substr(1, 1)) {
                            case 'u': sortScores[i] += 20; break;
                            case 'd': sortScores[i] += 30; break;
                            case 'l': sortScores[i] += 40; break;
                            case 'r': sortScores[i] += 50; break;
                        }
                    }
                    break;
                default:
                    sortScores[i] = 999;
                    prettyAlert('Unrecognised control <code>' + id + '</code> at user.css.');
                    break;
            }
            if (sortScores[i] < 990) {
                var maybeNumber = Number(id.substring(1));
                // Number return a NaN if there are no digits. The following conditional discards those NaNs:
                // (also zeros, but they would have the same effect anyways)
                if (maybeNumber) { sortScores[i] += maybeNumber; }
            }
        }
    });
    if (typeof callback == 'function') {
        return sortScores[0];
    } else {
        if (sortScores[0] < sortScores[1]) { return -1; } else { return 1; }
    }
}

function truncate(f, vibration) {
    if (f < 0) { if (vibration) {window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);} return 0; }
    if (f > 1) { if (vibration) {window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);} return 1; }
    return f;
}

//
// CONTROL DEFINITIONS
//
function Control(type, id, updateStateCallback) {
    this.element = document.createElement('div');
    this.element.className = 'control ' + type;
    this.element.id = id;
    this.element.style.gridArea = id;
    this.gridArea = id;
    this.updateStateCallback = updateStateCallback;
    this._state = 0;
}
Control.prototype.onAttached = function() {};
Control.prototype.state = function() {
    return this._state.toString();
};

function Joystick(id, updateStateCallback) {
    Control.call(this, 'joystick', id, updateStateCallback);
    this._stateX = 0.5;
    this._stateY = 0.5;
    this._locking = (id[0] == 's');
    this._offset = {};
    this._circle = document.createElement('div');
    this._circle.className = 'circle';
    this.element.appendChild(this._circle);
    axes += 2;
}
Joystick.prototype = Object.create(Control.prototype);
Joystick.prototype.onAttached = function() {
    this._offset = this.element.getBoundingClientRect();
    this._updateCircle();
    this.element.addEventListener('touchmove', this.onTouch.bind(this), false);
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
};
Joystick.prototype.onTouch = function(ev) {
    var pos = ev.targetTouches[0];
    this._stateX = truncate((pos.pageX - this._offset.x) / this._offset.width, true);
    this._stateY = truncate((pos.pageY - this._offset.y) / this._offset.height, true);
    this._updateCircle();
    this.updateStateCallback();
};
Joystick.prototype.onTouchStart = function(ev) {
    this.onTouch(ev);
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
};
Joystick.prototype.onTouchEnd = function() {
    if (!this._locking) {
        this._stateX = 0.5;
        this._stateY = 0.5;
        this._updateCircle();
        this.updateStateCallback();
    }
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
};
Joystick.prototype.state = function() {
    return this._stateX.toString() + ',' + this._stateY.toString();
};
Joystick.prototype._updateCircle = function() {
    this._circle.style.left = (this._offset.x + this._offset.width * this._stateX) + 'px';
    this._circle.style.top = (this._offset.y + this._offset.height * this._stateY) + 'px';
};

function Motion(id, updateStateCallback) {
    // Motion reads the letters in id to decide which coordinates should it send to the Yoke server.
    // This way is easy to program and avoids conditionals, loops, and objects,
    // but maybe it's not the most performant.
    // Motion calculates always every coordinate, then applies a mask on it.
    if (id.length != 2) { prettyAlert('Please use only one coordinate per motion sensor.'); }
    this._mask = null;
    switch (id[1]) {
        case 'x': this._mask = 0; break;
        case 'y': this._mask = 1; break;
        case 'z': this._mask = 2; break;
        case 'a': this._mask = 3; break;
        case 'b': this._mask = 4; break;
        case 'g': this._mask = 5; break;
        default:
            prettyAlert('Motion detection error: Unrecognised coordinate <code>' + id[1] + '</code>.');
            break;
    }
    // Only the last defined sensor sends events.
    // It's a really hacky and ugly method, but all the motion information
    // is a property of the window anyways, not of any Motion instance.
    motionSensor = this;
    if (this._mask <= 2 && !deviceMotionEL) {
        deviceMotionEL = window.addEventListener('devicemotion', Motion.prototype.onDeviceMotion, true);
    } else if (this._mask >= 3 && !deviceOrientationEL) {
        deviceOrientationEL = window.addEventListener('deviceorientation', Motion.prototype.onDeviceOrientation, true);
    }
    Control.call(this, 'motion', id, updateStateCallback);
    axes += 1;
}
Motion.prototype = Object.create(Control.prototype);
Motion.prototype._normalize = function(f) {
    f *= ACCELERATION_CONSTANT;
    if (f < -0.5) { f = -0.5; }
    if (f > 0.5) { f = 0.5; }
    return f + 0.5;
};
Motion.prototype.onAttached = function() {};
Motion.prototype.onDeviceMotion = function(ev) {
    motionState[0] = Motion.prototype._normalize(ev.accelerationIncludingGravity.x);
    motionState[1] = Motion.prototype._normalize(ev.accelerationIncludingGravity.y);
    motionState[2] = Motion.prototype._normalize(ev.accelerationIncludingGravity.z);
    motionSensor.updateStateCallback();
};
Motion.prototype.onDeviceOrientation = function(ev) {
    motionState[3] = ev.alpha / 360;
    motionState[4] = ev.beta / 180 + .5;
    motionState[5] = ev.gamma / 180 + .5;
    motionSensor.updateStateCallback();
};
Motion.prototype.state = function() {
    return motionState[this._mask].toString();
};

function Pedal(id, updateStateCallback) {
    Control.call(this, 'button', id, updateStateCallback);
    this._state = 0;
    this._offset = {};
    axes += 1;
}
Pedal.prototype = Object.create(Control.prototype);
Pedal.prototype.onAttached = function() {
    this._offset = this.element.getBoundingClientRect();
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
};
Pedal.prototype.onTouchStart = function(ev) {
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
    this.onTouchMove(ev);
};
Pedal.prototype.onTouchMove = function(ev) {
    /*
    //Not every screen can detect finger pressure, and the ones that do are difficult to calibrate.
    this._state = ev.touches[0].force;
    if (this._state == 0) {this.state = 0.5};
    */
    // Detection based on Y-coordinate, on the other hand, is intuitive and reliable in any device:
    var pos = ev.targetTouches[0];
    this._state = truncate((this._offset.y - pos.pageY) / this._offset.height + 1, false);
    this.updateStateCallback();
};
Pedal.prototype.onTouchEnd = function() {
    this._state = 0;
    this.updateStateCallback();
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
};

function Knob(id, updateStateCallback) {
    Control.call(this, 'knob', id, updateStateCallback);
    this._state = 0;
    this._offset = {};
    this._knobcircle = document.createElement('div');
    this._knobcircle.className = 'knobcircle';
    this.element.appendChild(this._knobcircle);
    this._circle = document.createElement('div');
    this._circle.className = 'circle';
    this._knobcircle.appendChild(this._circle);
    axes += 1;
}
Knob.prototype = Object.create(Control.prototype);
Knob.prototype.onAttached = function() {
    // First approximation to the knob coordinates.
    this._offset = this.element.getBoundingClientRect();
    // Centering the knob within the boundary.
    var mindimension = Math.min(this._offset.width, this._offset.height);
    if (mindimension == this._offset.width) {
        this._knobcircle.style.top = this._offset.y + (this._offset.height - this._offset.width) / 2 + 'px';
        this._offset.height = this._offset.width;
    } else {
        this._knobcircle.style.left = this._offset.x + (this._offset.width - this._offset.height) / 2 + 'px';
        this._offset.width = this._offset.height;
    }
    this._knobcircle.style.height = this._offset.width + 'px';
    this._knobcircle.style.width = this._offset.height + 'px';
    // Calculating the exact center.
    this._offset = this._knobcircle.getBoundingClientRect();
    this._offset.x += this._offset.width / 2;
    this._offset.y += this._offset.height / 2;
    this._updateCircles();
    this.element.addEventListener('touchmove', this.onTouch.bind(this), false);
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
};
Knob.prototype.onTouch = function(ev) {
    var pos = ev.targetTouches[0];
    this._state = Math.atan2(pos.pageY - this._offset.y, pos.pageX - this._offset.x) / 2 / Math.PI + 0.5;
    this._updateCircles();
    this.updateStateCallback();
};
Knob.prototype.onTouchStart = function(ev) {
    this.onTouch(ev);
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
};
Knob.prototype.onTouchEnd = function() {
    this._updateCircles();
    this.updateStateCallback();
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
};
Knob.prototype._updateCircles = function() {
    this._knobcircle.style.transform = 'rotate(' + ((this._state - 0.5) * 360) + 'deg)';
};

function Button(id, updateStateCallback) {
    Control.call(this, 'button', id, updateStateCallback);
    this._state = 0;
    buttons += 1;
}
Button.prototype = Object.create(Control.prototype);
Button.prototype.onAttached = function() {
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
};
Button.prototype.onTouchStart = function() {
    this._state = 1;
    this.updateStateCallback();
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
};
Button.prototype.onTouchEnd = function() {
    this._state = 0;
    this.updateStateCallback();
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
};

function Dummy(id, updateStateCallback) {
    Control.call(this, 'dummy', 'dum', updateStateCallback);
    buttons += 1;
}
Dummy.prototype = Object.create(Control.prototype);

//
// JOYPAD
//
function Joypad() {
    var updateStateCallback = this.updateState.bind(this);

    this._controls = [];

    this.element = document.getElementById('joypad');
    var gridAreas = getComputedStyle(this.element)
        .gridTemplateAreas
        .split('"').join('')
        .split(' ')
        .filter(function(x) { return x != '' && x != '.'; });
    var controlIDs = gridAreas.sort(mnemonics).filter(unique);
    this._debugLabel = null;
    controlIDs.forEach(function(id) {
        if (id != 'dbg') {
            this._controls.push(mnemonics(id, updateStateCallback));
        } else if (this._debugLabel == null) {
            this._debugLabel = new Control('debug', 'dbg');
            this.element.appendChild(this._debugLabel.element);
        }
    }, this);
    this._controls.forEach(function(control) {
        this.element.appendChild(control.element);
        control.onAttached();
    }, this);
    if (axes == 0 && buttons == 0) {
        prettyAlert('You don\'t seem to have any controls in your gamepad. Is <code>user.css</code> missing or broken?');
    }
    // This section is to be excised later.
    if (axes != 4) {
        prettyAlert('Currently, Yoke requires precisely 4 analog axes. Please edit your CSS.');
    }
    if (buttons > 32) {
        prettyAlert('Currently, Yoke allows a maximum of 32 buttons.');
    } else {
        for (buttons; buttons < 32; buttons++) {
            this._controls.push(new Dummy('dum', updateStateCallback));
        }
    }
    // End of section to be deleted.

}
Joypad.prototype.updateState = function() {
    var state = this._controls.map(function(control) { return control.state(); }).join(',');

    if (typeof window.Yoke !== 'undefined') {
        window.Yoke.update_vals(state); // only works in yoke webview
    }

    if (this._debugLabel != null) {
        this._debugLabel.element.innerHTML = state;
    }

    if (!DEBUG_NO_CONSOLE_SPAM) { console.log(state); }
};

//
// BASE CODE
//
// These variables are automatically updated by the code
var joypad = null;
var buttons = 0; // number of buttons total
var axes = 0; // number of analog axes total
var motionState = [0, 0, 0, 0, 0, 0];
var motionSensor = null;
var deviceMotionEL = null;
var deviceOrientationEL = null;

// If the user's browser needs permission to vibrate
// it's more convenient to ask for it first before entering fullscreen.
// This is useful e.g. in Firefox for Android.
window.navigator.vibrate(50);

function loadPad(filename) {
    var head = document.head;
    var link = document.createElement('link');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = filename;

    document.getElementById('menu').style.display = 'none';

    window.addEventListener('resize', function() {
        if (joypad != null) {
            joypad._controls.forEach(function(control) {
                control.onAttached();
            });
        }
    });

    // https://stackoverflow.com/a/7966541/5108318
    // https://stackoverflow.com/a/38711009/5108318
    // https://stackoverflow.com/a/25876513/5108318
    var el = document.documentElement;
    var rfs = el.requestFullScreen ||
        el.webkitRequestFullScreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;
    if (rfs && WAIT_FOR_FULLSCREEN) { rfs.bind(el)(); }
    link.onload = function() {
        document.getElementById('joypad').style.display = 'grid';
        var warningDiv = document.getElementById('warning');
        if (window.CSS && CSS.supports('display', 'grid')) {
            warningDiv.addEventListener('click', function() { warningDiv.style.display = 'none'; }, false);
            warningDiv.style.display = 'none';
        }
        joypad = new Joypad();
    };

    head.appendChild(link);
}

document.getElementById('racing').addEventListener('click', function() { loadPad('racing.css'); });
document.getElementById('gamepad').addEventListener('click', function() { loadPad('gamepad.css'); });
document.getElementById('testing').addEventListener('click', function() { loadPad('testing.css'); });
