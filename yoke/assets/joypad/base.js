'use strict';

// SETTINGS:
var VIBRATE_ON_QUADRANT_BOUNDARY = true;
var VIBRATE_ON_PAD_BOUNDARY = true;
var VIBRATE_PROPORTIONALLY_TO_DISTANCE = true;
// These 2 options are recommended for testing in non-kiosk/non-embedded browsers:
var WAIT_FOR_FULLSCREEN = false;
var DEBUG_NO_CONSOLE_SPAM = true;

// CONSTANTS:
var VIBRATION_MILLISECONDS_IN = 40;
var VIBRATION_MILLISECONDS_OUT = 30;
var VIBRATION_MILLISECONDS_OVER = 20;
var VIBRATION_MILLISECONDS_SATURATION = [10, 10];
var ACCELERATION_CONSTANT = 0.025;

// HELPER FUNCTIONS:
// Within the Yoke webview, Yoke.update_vals() sends the joypad state.
// Outside the Yoke webview, Yoke.update_vals() is redefined to have no effect.
// This prevents JavaScript exceptions, and wastes less CPU time when in Yoke:
if (typeof window.Yoke === 'undefined') {
    window.Yoke = {update_vals: function() {}};
}

function prettyAlert(message) {
    var warningDiv = document.getElementById('warning');
    warningDiv.innerHTML = message + '<p class=\'dismiss\'>Tap to dismiss.</p>';
    warningDiv.style.display = 'inline';
}

// https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates#14438954
function unique(value, index, self) { return self.indexOf(value) === index; }

function mnemonics(id, callback) {
    // Chooses the correct control for the joypad from its mnemonic code.
    switch (id[0]) {
        case 's': case 'j':
            // 's' is a locking joystick, 'j' - non-locking
            return new Joystick(id, callback); break;
        case 'm':
            var legalLabels = 'xyzabg';
            if (legalLabels.indexOf(id[1]) == -1) {
                prettyAlert('Motion detection error: \
                    Unrecognised coordinate <code>' + id[1] + '</code>.');
                return null;
            } else { return new Motion(id, callback); }
            break;
        case 'p':
            var legalLabels = 'abt';
            if (legalLabels.indexOf(id[1]) == -1) {
                prettyAlert('<code>' + id + '</code> is not a valid pedal. \
                    Please use <code>pa</code> or <code>pt</code> for accelerator \
                    and <code>pb</code> for brakes.');
                return null;
            } else { return new Pedal(id, callback); }
            break;
        case 'k': return new Knob(id, callback); break;
        case 'a': return new AnalogButton(id, callback); break;
        case 'b': return new Button(id, callback); break;
        case 'd':
            var legalLabels = 'udlr';
            if (legalLabels.indexOf(id[1]) == -1) {
                prettyAlert('D-pad error: \
                    <code>' + id[1] + '</code> is not a cardinal direction.');
                return null;
            } else { return new Button(id, callback); break; }
        default:
            prettyAlert('Unrecognised control <code>' + id + '</code> at user.css.');
            return null; break;
    }
}

function categories(a, b) {
    // Custom algorithm to sort control mnemonics.
    var ids = [a, b];
    var sortScores = ids.slice();
    // sortScores contains arbitrary numbers. The lower-ranking controls are attached earlier.
    ids.forEach(function(id, i) {
        if (id == 'dbg') { sortScores[i] = 999998; } else {
            sortScores[i] = 999997;
            switch (id[0]) {
                // 's' is a locking joystick, 'j' - non-locking
                case 's': case 'j': sortScores[i] = 100000; break;
                case 'm': sortScores[i] = 200000; break;
                case 'p': sortScores[i] = 300000; break;
                case 'k': sortScores[i] = 400000; break;
                case 'a': sortScores[i] = 500000; break;
                case 'b': sortScores[i] = 600000; break;
                case 'd': sortScores[i] = 700000; break;
                default: sortScores[i] = 999999999; break;
            }
            if (sortScores[i] < 999990) {
                // This line should sort controls in the same category by id length,
                // and after that, by the ASCII codes in the id tag
                // This shortcut reorders non-negative integers at the end of a mnemonic correctly,
                // and letters with the same capitalization in alphabetical order.
                sortScores[i] += id.substring(1).split('')
                    .reduce(function(acc, cur) {return 256 * acc + cur.charCodeAt();}, 0);
            }
        }
    });
    return (sortScores[0] < sortScores[1]) ? -1 : 1;
}

function truncate(val, id, pattern) {
    var truncated = false;
    if (val < 0.000001) { truncated = true; return 0.000001; }
    else if (val > 0.999999) { truncated = true; return 0.999999; }
    else { return val; }
    if (VIBRATE_ON_PAD_BOUNDARY && pattern) {
        truncated ? queueForVibration(id, pattern) : unqueueForVibration(id);
    }
    return f;
}

// HAPTIC FEEDBACK MIXING:
var vibrating = {};

function queueForVibration(id, pattern) {
    vibrating[id] = {
        time: performance.now(),
        pulse: pattern[0],
        pause: pattern[1],
        kill: false
    };
}

function unqueueForVibration(id) {
    if (id in vibrating) { vibrating[id].kill = true; }
    // And wait for checkVibration to kill it.
    // This is heavier for the browser, but also avoids race conditions between checkVibration() and unqueueForVibration().
}

function checkVibration() {
    for (var id in vibrating) {
        if (vibrating[id].kill) {
            delete vibrating[id];
        } else if (performance.now() > vibrating[id].time) {
            vibrating[id].time = vibrating[id].pulse + vibrating[id].pause + performance.now();
            window.navigator.vibrate(vibrating[id].pulse);
        }
    }
    window.requestAnimationFrame(checkVibration);
}

// GAMEPAD CONTROLS:
function Control(type, id, updateStateCallback) {
    this.element = document.createElement('div');
    this.element.className = 'control ' + type;
    this.element.id = id;
    this.element.style.gridArea = id;
    this.gridArea = id;
    this.updateStateCallback = updateStateCallback;
    this._state = 0;
    this.shape = 'rectangle';
}
Control.prototype.getBoundingClientRect = function() {
    this._offset = this.element.getBoundingClientRect();
    this._offset.semiwidth = this._offset.width / 2;
    this._offset.semiheight = this._offset.height / 2;
    this._offset.xCenter = this._offset.x + this._offset.semiwidth;
    this._offset.yCenter = this._offset.y + this._offset.semiheight;
    if (this.shape == 'square') {
        if (this._offset.width < this._offset.height) {
            this._offset.y += this._offset.semiheight - this._offset.semiwidth;
            this._offset.height = this._offset.width;
            this._offset.semiheight = this._offset.semiwidth;
        } else {
            this._offset.x += this._offset.semiwidth - this._offset.semiheight;
            this._offset.width = this._offset.height;
            this._offset.semiwidth = this._offset.semiheight;
        }
    }
    this._offset.xMax = this._offset.x + this._offset.width;
    this._offset.yMax = this._offset.y + this._offset.height;
};
Control.prototype.onAttached = function() {};
Control.prototype.state = function() {
    return Math.floor(256 * this._state);
};

function Joystick(id, updateStateCallback) {
    Control.call(this, 'joystick', id, updateStateCallback);
    this._state = [0, 0];
    this.quadrant = -2;
    this._locking = (id[0] == 's');
    this._circle = document.createElement('div');
    this._circle.className = 'circle';
    this.element.appendChild(this._circle);
    axes += 2;
}
Joystick.prototype = Object.create(Control.prototype);
Joystick.prototype.onAttached = function() {
    this._updateCircle();
    this.element.addEventListener('touchmove', this.onTouch.bind(this), false);
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
};
Joystick.prototype.onTouch = function(ev) {
    var pos = ev.targetTouches[0];
    this._state = [
        (pos.pageX - this._offset.xCenter) / this._offset.semiwidth,
        (pos.pageY - this._offset.yCenter) / this._offset.semiheight
    ];
    var distance = Math.max(Math.abs(this._state[0]), Math.abs(this._state[1]));
    if (distance < 1) {
        this.updateStateCallback();
        unqueueForVibration(this.element.id);
        var currentQuadrant = Math.atan2(this._state[1], this._state[0]) / Math.PI + 1.125; // rad ÷ pi, shifted 22.5 deg. [0.25, 2.25]
        currentQuadrant = Math.floor((currentQuadrant * 4) % 8); // [1, 9] → [1, 8)+[0, 1)
        if (VIBRATE_ON_QUADRANT_BOUNDARY && this.quadrant != -2 && this.quadrant != currentQuadrant) {
            window.navigator.vibrate(VIBRATION_MILLISECONDS_OVER);
        }
        this.quadrant = currentQuadrant;
    } else {
        this._state[0] = Math.min(0.99999, Math.max(-0.99999, this._state[0]));
        this._state[1] = Math.min(0.99999, Math.max(-0.99999, this._state[1]));
        this.updateStateCallback();
        if (VIBRATE_ON_PAD_BOUNDARY) {
             if (!VIBRATE_PROPORTIONALLY_TO_DISTANCE) { distance = 1; }
             queueForVibration(this.element.id, [
                     distance * VIBRATION_MILLISECONDS_SATURATION[0],
                     VIBRATION_MILLISECONDS_SATURATION[1]
             ]);
        }
        this.quadrant = -2;
    }
    this._updateCircle();
};
Joystick.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    var oldState = this._state;
    this.onTouch(ev);
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
};
Joystick.prototype.onTouchEnd = function() {
    if (!this._locking) {
        this._state = [0, 0];
        this.updateStateCallback();
        this._updateCircle();
    }
    this.quadrant = -2;
    unqueueForVibration(this.element.id);
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
};
Joystick.prototype._updateCircle = function() {
    this._circle.style.transform = 'translate(-50%, -50%) translate(' +
        (this._offset.xCenter + this._offset.semiwidth * this._state[0]) + 'px, ' +
        (this._offset.yCenter + this._offset.semiheight * this._state[1]) + 'px)';
};
Joystick.prototype.state = function() {
    return this._state.map(function(val) {return Math.floor(128 * (val + 1));});
};

function Motion(id, updateStateCallback) {
    // Motion reads the letters in id to decide which coordinates should it send to the Yoke server.
    // This way is easy to program and avoids conditionals, loops, and objects,
    // but maybe it's not the most performant.
    // Motion calculates always every coordinate, then applies a mask on it.
    if (id.length != 2) { prettyAlert('Please use only one coordinate per motion sensor.'); }
    var legallabels = 'xyzabg';
    this._mask = legallabels.indexOf(id[1]);
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
    if (f < -0.499999) { f = -0.499999; }
    if (f > 0.499999) { f = 0.499999; }
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
    return Math.floor(256 * motionState[this._mask]);
};

function Pedal(id, updateStateCallback) {
    Control.call(this, 'button', id, updateStateCallback);
    this._state = 0;
    axes += 1;
}
Pedal.prototype = Object.create(Control.prototype);
Pedal.prototype.onAttached = function() {
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
};
Pedal.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
    this.onTouchMove(ev);
    this.element.classList.add('pressed');
};
Pedal.prototype.onTouchMove = function(ev) {
    // This is the default handler, which uses the Y-coordinate to control the pedal.
    // This function is overwritten if the user confirms the screen can detect touch pressure:
    var pos = ev.targetTouches[0];
    this._state = truncate((this._offset.y - pos.pageY) / this._offset.height + 1);
    if (this._state == 0.999999 || this._state == 0.000001) {
        queueForVibration(this.element.id, VIBRATION_MILLISECONDS_SATURATION);
    }
    this.updateStateCallback();
};
Pedal.prototype.onTouchMoveForce = function(ev) {
    // This is the replacement handler, which uses touch pressure.
    // Overwriting the handler once is much faster than checking
    // minForce and maxForce at every updateStateCallback:
    var pos = ev.targetTouches[0];
    this._state = truncate((pos.force - minForce) / (maxForce - minForce));
    this.updateStateCallback();
};
Pedal.prototype.onTouchEnd = function() {
    this._state = 0;
    this.updateStateCallback();
    unqueueForVibration(this.element.id);
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
    this.element.classList.remove('pressed');
};

function AnalogButton(id, updateStateCallback) {
    this.onTouchMoveParticular = function() {};
    Control.call(this, 'button', id, updateStateCallback);
    this._state = 0;
    axes += 1;
}
AnalogButton.prototype = Object.create(Control.prototype);
AnalogButton.prototype.onAttached = function() {
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
    if (this._offset.width > this._offset.height) {
        this.onTouchMoveParticular = function(ev) {
            var pos = ev.targetTouches[0];
            return truncate(1 - Math.abs(this._offset.xCenter - pos.pageX) / this._offset.semiwidth);
        };
    } else {
        this.onTouchMoveParticular = function(ev) {
            var pos = ev.targetTouches[0];
            return truncate(1 - Math.abs(this._offset.yCenter - pos.pageY) / this._offset.semiheight);
        };
    }
};
AnalogButton.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
    this.onTouchMove(ev);
    this.element.classList.add('pressed');
};
AnalogButton.prototype.onTouchMove = function(ev) {
    // This is the default handler, which uses the distance to the center (horizontal in wide buttons, vertical in tall buttons).
    // This function is overwritten if the user confirms the screen can detect touch pressure:
    this._state = this.onTouchMoveParticular(ev);
    this.updateStateCallback();
};
AnalogButton.prototype.onTouchMoveForce = function(ev) {
    // This is the replacement handler, which uses touch pressure.
    var pos = ev.targetTouches[0];
    this._state = truncate((pos.force - minForce) / (maxForce - minForce));
    this.updateStateCallback();
};
AnalogButton.prototype.onTouchEnd = function() {
    this._state = 0;
    this.updateStateCallback();
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
    this.element.classList.remove('pressed');
};

function Knob(id, updateStateCallback) {
    Control.call(this, 'knob', id, updateStateCallback);
    this.shape = 'square';
    this._state = 0;
    this.initState = 0; // state at onTouchStart
    this.initAngle = 0; // angular coordinate at onTouchStart
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
    // Centering the knob within the boundary.
    this._knobcircle.style.top = this._offset.y + 'px';
    this._knobcircle.style.left = this._offset.x + 'px';
    this._knobcircle.style.height = this._offset.width + 'px';
    this._knobcircle.style.width = this._offset.height + 'px';
    this._updateCircles();
    this.quadrant = 0;
    this.element.addEventListener('touchmove', this.onTouch.bind(this), false);
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
};
Knob.prototype.onTouch = function(ev) {
    var pos = ev.targetTouches[0];
    // The knob now increments the state proportionally to the turned angle.
    // This requires substracting the current angular position from the position at onTouchStart
    // A real knob turns the same way no matter where you touch it.
    this._state = (this.initState + (Math.atan2(pos.pageY - this._offset.yCenter,
        pos.pageX - this._offset.xCenter) - this.initAngle) / (2 * Math.PI)) % 1;
    this.updateStateCallback();
    var currentQuadrant = Math.floor(this._state * 16);
    if (VIBRATE_ON_QUADRANT_BOUNDARY && this.quadrant != currentQuadrant) {
        window.navigator.vibrate(VIBRATION_MILLISECONDS_OVER);
    }
    this.quadrant = currentQuadrant;
    this._updateCircles();
};
Knob.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    var pos = ev.targetTouches[0];
    this.initAngle = Math.atan2(pos.pageY - this._offset.yCenter,
        pos.pageX - this._offset.xCenter) - 2 * Math.PI;
    this.onTouch(ev);
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
};
Knob.prototype.onTouchEnd = function() {
    this.updateStateCallback();
    this.initState = this._state;
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
    this._updateCircles();
};
Knob.prototype._updateCircles = function() {
    this._knobcircle.style.transform = 'rotate(' + ((this._state - 0.25) * 360) + 'deg)';
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
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
};
Button.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    this._state = 1;
    this.updateStateCallback();
    this.element.classList.add('pressed');
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
};
Button.prototype.onTouchEnd = function() {
    this._state = 0;
    this.updateStateCallback();
    this.element.classList.remove('pressed');
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
};
Button.prototype.state = function() { return this._state; };

// JOYPAD:
function Joypad() {
    var updateStateCallback = this.updateState.bind(this);

    this._controls = [];

    this.element = document.getElementById('joypad');
    var gridAreas = getComputedStyle(this.element)
        .gridTemplateAreas
        .split('"').join('').split(' ')
        .filter(function(x) { return x != '' && x != '.'; });
    var controlIDs = gridAreas.sort(categories).filter(unique);
    this._debugLabel = null;
    controlIDs.forEach(function(id) {
        if (id != 'dbg') {
            this._controls.push(mnemonics(id, updateStateCallback));
            if (this._controls[this._controls.length - 1] == null) {
                this._controls.pop() // discard unrecognised controls
            }
            this.updateDebugLabel = function(state) {
                // shadow dummy function with useful function
                this._debugLabel.element.innerHTML = state;
            }
        } else if (this._debugLabel == null) {
            this._debugLabel = new Control('debug', 'dbg');
            this.element.appendChild(this._debugLabel.element);
        }
    }, this);
    this._controls.forEach(function(control) {
        this.element.appendChild(control.element);
        control.getBoundingClientRect();
        control.onAttached();
    }, this);
    if (axes == 0 && buttons == 0) {
        prettyAlert('Your gamepad looks empty. Is <code>user.css</code> missing or broken?');
    }
    var kernelEvents = this._controls.map(function(control) { return control.element.id; }).join(',');
    if (this._debugLabel != null) {
        this._debugLabel.element.innerHTML = kernelEvents;
    }
    if (!DEBUG_NO_CONSOLE_SPAM) { console.log(kernelEvents); }
    window.Yoke.update_vals(kernelEvents);
    checkVibration();
}
Joypad.prototype.updateState = function() {
    var state = this._controls.map(function(control) { return control.state(); }).join(',');
    window.Yoke.update_vals(state);
    this.updateDebugLabel(state);
    if (!DEBUG_NO_CONSOLE_SPAM) { console.log(state); }
};
Joypad.prototype.updateDebugLabel = function() { } //dummy function

// BASE CODE:
// These variables are automatically updated by the code:
var joypad = null;
var buttons = 0; // number of buttons total
var axes = 0; // number of analog axes total
var motionState = [0, 0, 0, 0, 0, 0];
var motionSensor = null;
var deviceMotionEL = null;
var deviceOrientationEL = null;

// These will record the minimum and maximum force the screen can register.
// They'll hopefully be updated with the actual minimum and maximum:
var minForce = 1;
var maxForce = 0;

// This function updates minForce and maxForce if the force is not exactly 0 or 1.
// If minForce is not less than maxForce after a touch event,
// the touchscreen can't detect finger pressure, even if it reports it can.
function recordPressure(ev) {
    var force = ev.targetTouches[0].force;
    if (force > 0 && force < 1) {
        minForce = Math.min(minForce, force);
        maxForce = Math.max(maxForce, force);
        forceBar.style.transform = 'scaleX(' + force + ')';
        forceBar.style.opacity = '1';
    }
}

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
            if (minForce > maxForce) { // no touch force detection capability
                joypad = new Joypad();
            } else { // possible force detection capability
                var calibrationDiv = document.getElementById('calibration');
                forceBar.style.opacity = '0.2';
                calibrationDiv.style.display = 'inline';
                calibrationDiv.addEventListener('touchmove', recordPressure);
                calibrationDiv.addEventListener('touchend', function() { forceBar.style.opacity = '0.2'; });
                document.getElementById('calibrationOk').addEventListener('click', function() {
                    calibrationDiv.style.display = 'none';
                    Pedal.prototype.onTouchMove = Pedal.prototype.onTouchMoveForce;
                    AnalogButton.prototype.onTouchMove = AnalogButton.prototype.onTouchMoveForce;
                    joypad = new Joypad();
                });
                document.getElementById('calibrationNo').addEventListener('click', function() {
                    calibrationDiv.style.display = 'none';
                    minForce = 1; maxForce = 0; joypad = new Joypad();
                });
            }
        }
    };

    head.appendChild(link);
}

var forceBar = document.getElementById('force');
document.getElementById('menu').childNodes.forEach(function(child) {
    var id = child.id;
    if (id) {
        child.addEventListener('click', function() { loadPad(id + '.css'); });
        child.addEventListener('touchstart', recordPressure);
        child.addEventListener('touchmove', recordPressure);
    }
});
