'use strict';

// SETTINGS:
// Octant refers to the 8 sectors in which the area of a joystick is divided.
// These 8 sectors are more or less aligned with the cardinal directions,
// and allow one to feel when one is changing directions without looking.
var VIBRATE_ON_OCTANT_BOUNDARY = true;
var VIBRATE_ON_PAD_BOUNDARY = true;
var VIBRATE_PROPORTIONALLY_TO_DISTANCE = true;
// These 2 options are recommended for testing in non-kiosk/non-embedded browsers:
var WAIT_FOR_FULLSCREEN = false;
var DEBUG_NO_CONSOLE_SPAM = true;

// CONSTANTS:
// When clicking a button (onTouchStart):
var VIBRATION_MILLISECONDS_IN = 40;
// When changing octants in a joystick:
var VIBRATION_MILLISECONDS_OVER = 20;
// When forcing a control over the maximum or the minimum:
var VIBRATION_MILLISECONDS_SATURATION = [10, 10];
// When pushing a thumb joystick down or releasing it:
var VIBRATION_MILLISECONDS_THUMB = 35;
// When clicking a D-Pad button (this.state change):
var VIBRATION_MILLISECONDS_DPAD = 35;
// Length, relative to the D-pad, of the hitbox of a D-pad leg, from border to center:
var DPAD_BUTTON_LENGTH = 0.4;
// Length, relative to the D-pad, of the hitbox of a D-pad leg, measured perpendicularly to the length:
var DPAD_BUTTON_WIDTH = 0.5;
// Pixels between apparent and real (oversized) hitbox of a button, to the left (and the right):
var BUTTON_OVERSHOOT_WIDTH = 7;
// Pixels between apparent and real (oversized) hitbox of a button, upwards (and downwards):
var BUTTON_OVERSHOOT_HEIGHT = 7;
// To normalize values from accelerometers:
var ACCELERATION_CONSTANT = 0.025;
// Multiplier for analog buttons in non-force-detecting mode.
// (Simulated force is multiplied by this number, and truncated in case of saturation.)
// The dead zone length/width, relative to the analog button hitbox length/width,
// will be 1 - (1 / ANALOG_BUTTON_DEADZONE_CONSTANT).
var ANALOG_BUTTON_DEADZONE_CONSTANT = 1.10;

// HELPER FUNCTIONS:
if (typeof window.Yoke === 'undefined') {
    // These functions are redefined when loaded from outside the app to avoid JS errors,
    // and to allow for quick debugging on the computer.
    // A full description of these functions is located at:
    // https://github.com/rmst/yoke-android/blob/master/app/src/main/java/com/simonramstedt/yoke/YokeActivity.java
    window.Yoke = {
        update_vals: function() {}, // send gamepad status to Yoke app
        set_bye: function() {}, // set pattern for Yoke to send before disconnecting from client
        alert: function(msg) {alert(msg);} // show prompt on Yoke app
    };
}

// https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates#14438954
function unique(value, index, self) { return self.indexOf(value) === index; }

function categories(a, b) {
    // Custom algorithm to sort control mnemonics.
    var ids = [a, b];
    var sortScores = ids.slice();
    // sortScores contains arbitrary numbers. The lower-ranking controls are attached earlier.
    ids.forEach(function(id, i) {
        if (id == 'dbg') { sortScores[i] = 999998; } else {
            sortScores[i] = 999997;
            switch (id[0]) {
                // 's' is a locking joystick, 'j' - non-locking, 't' - thumbstick with L3/R3 button
                case 's': case 'j': case 't': sortScores[i] = 100000; break;
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

function truncate(val) {
    return (val < 0) ? 0 :
        (val > 0x7fff) ? 0x7fff : Math.floor(val);
}

var serializer = new TextDecoder('iso-8859-1');

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
}
Control.prototype.shape = 'rectangle';
Control.prototype.getBoundingClientRect = function() {
    this.offset = this.element.getBoundingClientRect();
    if (this.shape == 'square') {
        if (this.offset.width < this.offset.height) {
            this.offset.y += (this.offset.height - this.offset.width) / 2;
            this.offset.height = this.offset.width;
        } else {
            this.offset.x += (this.offset.width - this.offset.height) / 2;
            this.offset.width = this.offset.height;
        }
    } else if (this.shape == 'overshoot') {
        this.offset.x -= BUTTON_OVERSHOOT_WIDTH;
        this.offset.y -= BUTTON_OVERSHOOT_HEIGHT;
        this.offset.width += 2 * BUTTON_OVERSHOOT_WIDTH;
        this.offset.height += 2 * BUTTON_OVERSHOOT_HEIGHT;
    }
    this.offset.halfWidth = this.offset.width / 2;
    this.offset.halfHeight = this.offset.height / 2;
    this.offset.xCenter = this.offset.x + this.offset.halfWidth;
    this.offset.yCenter = this.offset.y + this.offset.halfHeight;
    this.offset.xMax = this.offset.x + this.offset.width;
    this.offset.yMax = this.offset.y + this.offset.height;
};
Control.prototype.onAttached = function() {};
Control.prototype.setBufferView = function(cursor, buffer) {
    this.stateBuffer = new DataView(buffer, cursor, 2);
    this.stateBuffer.setUint16(0, 0x0000 + cursor, false);
    return cursor + 2;
};

function Joystick(id, updateStateCallback) {
    Control.call(this, 'joystick', id, updateStateCallback);
    this.locking = (id[0] == 's');
    if (id[0] == 't') {
        this.state = [0, 0, 0];
        this.oldButtonState = 0;
    } else {
        this.state = [0, 0];
        this.checkThumbButton = function() {};
    }
    this.circle = document.createElement('div');
    this.circle.className = 'circle';
    this.element.appendChild(this.circle);
}
Joystick.prototype = Object.create(Control.prototype);
Joystick.prototype.onAttached = function() {
    this.updateCircle(this.offset.xCenter, this.offset.yCenter);
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), false);
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
    if (this.element.id[0] == 't') {
        this.element.classList.add('thumb');
    }
    this.offset.factorX = 0x4000 / this.offset.halfWidth;
    this.offset.factorY = 0x4000 / this.offset.halfHeight;
};
// This contant defines the limits of all the octants in analytic geometry:
Joystick.prototype.EIGHTH_OF_RADIAN = 1 / Math.sin(Math.PI / 8);
Joystick.prototype.onTouchMove = function(ev) {
    var pos = ev.targetTouches[0];
    this.state[0] = (pos.pageX - this.offset.xCenter) * this.offset.factorX;
    this.state[1] = (pos.pageY - this.offset.yCenter) * this.offset.factorY;
    this.stateBuffer.setUint16(0, truncate(this.state[0] + 0x4000), false);
    this.stateBuffer.setUint16(2, truncate(this.state[1] + 0x4000), false);
    this.checkThumbButton(ev);
    this.updateStateCallback();
    var distance = Math.max(Math.abs(this.state[0]), Math.abs(this.state[1]));
    if (distance < 0x4000) {
        unqueueForVibration(this.element.id);
        // Instead of calculating an accurate angle, we hardcode the limits of each octant using analytic geometry:
        // the lines that divide the sector are x/sin(π/8)=y, etc.
        var currentOctant =
            ((this.state[0] * this.EIGHTH_OF_RADIAN > this.state[1]) ? 1 : 0) +
            ((this.state[0] > this.state[1] * -this.EIGHTH_OF_RADIAN) ? 2 : 0) +
            ((this.state[0] * -this.EIGHTH_OF_RADIAN > this.state[1]) ? 4 : 0) +
            ((this.state[0] > this.state[1] * this.EIGHTH_OF_RADIAN) ? 8 : 0);
        if (VIBRATE_ON_OCTANT_BOUNDARY && this.octant != -2 && this.octant != currentOctant) {
            window.navigator.vibrate(VIBRATION_MILLISECONDS_OVER);
        }
        this.octant = currentOctant;
    } else {
        if (VIBRATE_ON_PAD_BOUNDARY) {
            queueForVibration(this.element.id, [
                VIBRATE_PROPORTIONALLY_TO_DISTANCE
                    ? distance / 0x4000 * VIBRATION_MILLISECONDS_SATURATION[0]
                    : VIBRATION_MILLISECONDS_SATURATION[0],
                VIBRATION_MILLISECONDS_SATURATION[1]
            ]);
        }
        this.octant = -2;
    }
    this.updateCircle(pos.pageX, pos.pageY);
};
Joystick.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    this.onTouchMove(ev);
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
};
Joystick.prototype.onTouchEnd = function(ev) {
    if (ev.targetTouches.length == 0) {
        if (!this.locking) {
            this.state[0] = 0;
            this.state[1] = 0;
            this.stateBuffer.setUint16(0, 0x4000, false);
            this.stateBuffer.setUint16(2, 0x4000, false);
        }
        if (this.state.length == 3) {
            this.state[2] = 0;
            this.stateBuffer.setUint8(4, 0);
            this.element.classList.remove('pressed');
            this.oldButtonState = 0;
        }
        this.updateStateCallback();
        this.updateCircle(this.offset.xCenter, this.offset.yCenter);
        this.octant = -2;
        unqueueForVibration(this.element.id);
    } else {
        this.onTouchMove(ev);
    }
};
Joystick.prototype.checkThumbButton = function(ev) {
    this.state[2] = (ev.targetTouches.length > 1) ? 1 : 0;
    this.stateBuffer.setUint8(4, this.state[2]);
    if (this.oldButtonState != this.state[2]) {
        window.navigator.vibrate(VIBRATION_MILLISECONDS_THUMB);
        (this.state[2] == 0) ? this.element.classList.remove('pressed') : this.element.classList.add('pressed');
        this.oldButtonState = this.state[2];
    }
};
Joystick.prototype.checkThumbButtonForce = function(ev) {
    this.state[2] = (ev.targetTouches[0].force > midForce) ? 1 : 0;
    this.stateBuffer.setUint8(4, this.state[2]);
    if (this.oldButtonState != this.state[2]) {
        window.navigator.vibrate(VIBRATION_MILLISECONDS_THUMB);
        (this.state[2] == 0) ? this.element.classList.remove('pressed') : this.element.classList.add('pressed');
        this.oldButtonState = this.state[2];
    }
};
Joystick.prototype.updateCircle = function(x, y) {
    this.circle.style.transform = 'translate(-50%, -50%) translate(' +
        Math.max(Math.min(x, this.offset.xMax), this.offset.x) + 'px, ' +
        Math.max(Math.min(y, this.offset.yMax), this.offset.y) + 'px)';
};
Joystick.prototype.setBufferView = function(cursor, buffer) {
    if (this.element.id[0] == 't') {
        this.stateBuffer = new DataView(buffer, cursor, 5);
        this.stateBuffer.setUint16(0, 0x4000, false);
        this.stateBuffer.setUint16(2, 0x4000, false);
        return cursor + 5;
    } else {
        this.stateBuffer = new DataView(buffer, cursor, 4);
        this.stateBuffer.setUint16(0, 0x4000, false);
        this.stateBuffer.setUint16(2, 0x4000, false);
        return cursor + 4;
    }
};

function Motion(id, updateStateCallback) {
    // Motion calculates always every coordinate, then applies a mask on it.
    var legalLabels = 'xyzabg';
    this.mask = legalLabels.indexOf(id[1]);
    this.updateTrinket = Motion.prototype['updateTrinket' + this.mask];
    Control.call(this, 'motion', id, updateStateCallback);
    this.trinket = document.createElement('div');
    this.trinket.className = 'motiontrinket';
    this.element.appendChild(this.trinket);
}
Motion.prototype = Object.create(Control.prototype);
Motion.prototype.onAttached = function() {};
Motion.prototype.onDeviceMotion = function(ev) {
    motionState[0] = ev.accelerationIncludingGravity.x * ACCELERATION_CONSTANT;
    motionState[1] = ev.accelerationIncludingGravity.y * ACCELERATION_CONSTANT;
    motionState[2] = ev.accelerationIncludingGravity.z * ACCELERATION_CONSTANT;
    joypad.controls.deviceMotion.forEach(function(c) {
        c.stateBuffer.setUint16(0, truncate(0x4000 * motionState[c.mask] + 0x4000), false);
        c.updateTrinket();
    });
    joypad.updateState();
};
Motion.prototype.onDeviceOrientation = function(ev) {
    motionState[3] = ev.alpha / 360;
    motionState[4] = ev.beta / 360 + .5;
    motionState[5] = ev.gamma / 180 + .5;
    joypad.controls.deviceOrientation.forEach(function(c) {
        c.stateBuffer.setUint16(0, truncate(0x8000 * motionState[c.mask]), false);
        c.updateTrinket();
    });
    joypad.updateState();
};
Motion.prototype.updateTrinket0 = function() {};
Motion.prototype.updateTrinket1 = function() {};
Motion.prototype.updateTrinket2 = function() {};
Motion.prototype.updateTrinket3 = function() {
    this.trinket.style.transform = 'rotateY(' + (motionState[this.mask] * -360) + 'deg)';
};
Motion.prototype.updateTrinket4 = function() {
    this.trinket.style.transform = 'rotateZ(' + ((.5 - motionState[this.mask]) * 360) + 'deg)';
};
Motion.prototype.updateTrinket5 = function() {
    this.trinket.style.transform = 'rotateX(' + ((.5 - motionState[this.mask]) * 180) + 'deg)';
};

function Pedal(id, updateStateCallback) {
    Control.call(this, 'pedal', id, updateStateCallback);
    this.state = 0;
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
    this.state = (this.offset.y - pos.pageY) / this.offset.height + 1;
    if (this.state > 1) {
        queueForVibration(this.element.id, VIBRATION_MILLISECONDS_SATURATION);
    } else {
        unqueueForVibration(this.element.id);
    }
    this.stateBuffer.setUint16(0, truncate(0x8000 * this.state), false);
    this.updateStateCallback();
};
Pedal.prototype.onTouchMoveForce = function(ev) {
    // This is the replacement handler, which uses touch pressure.
    // Overwriting the handler once is much faster than checking
    // minForce and maxForce at every updateStateCallback:
    var pos = ev.targetTouches[0];
    this.state = (pos.force - minForce) / (maxForce - minForce);
    if (this.state > 1) {
        queueForVibration(this.element.id, VIBRATION_MILLISECONDS_SATURATION);
    } else {
        unqueueForVibration(this.element.id);
    }
    this.stateBuffer.setUint16(0, truncate(0x8000 * this.state), false);
    this.updateStateCallback();
};
Pedal.prototype.onTouchEnd = function() {
    this.state = 0;
    this.stateBuffer.setUint16(0, 0, false);
    this.updateStateCallback();
    unqueueForVibration(this.element.id);
    this.element.classList.remove('pressed');
};

function AnalogButton(id, updateStateCallback) {
    Control.call(this, 'analogbutton', id, updateStateCallback);
    this.state = 0;
    this.oldState = 0;
    this.hitbox = document.createElement('div');
    this.hitbox.className = 'buttonhitbox';
    this.element.appendChild(this.hitbox);
}
AnalogButton.prototype = Object.create(Control.prototype);
AnalogButton.prototype.shape = 'overshoot';
AnalogButton.prototype.onAttached = function() {
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
    this.hitbox.style.transform = [
        'translate(' + this.offset.x, 'px, ', this.offset.y, 'px) ',
        'scaleX(', this.offset.width, ') ',
        'scaleY(', this.offset.height, ')'
    ].join('');
};
AnalogButton.prototype.processTouches = function(ev) {
    this.state = 0;
    for (var touch of ev.touches) {
        this.state = Math.max(this.state, ANALOG_BUTTON_DEADZONE_CONSTANT * Math.min(
            1 - Math.abs((touch.pageY - this.offset.yCenter) / this.offset.halfHeight),
            1 - Math.abs((touch.pageX - this.offset.xCenter) / this.offset.halfWidth)
        ));
    }
    this.stateBuffer.setUint16(0, truncate(this.state * 0x8000), false);
    var changed = ((this.oldState == 0) != (this.state == 0));
    if (changed) {
        (this.state == 0) ? this.element.classList.remove('pressed') : this.element.classList.add('pressed');
    }
    this.oldState = this.state;
    return changed;
};
AnalogButton.prototype.processTouchesForce = function(ev) {
    this.state = 0;
    for (var touch of ev.touches) {
        if (touch.pageX > this.offset.x && touch.pageX < this.offset.xMax &&
            touch.pageY > this.offset.y && touch.pageY < this.offset.yMax) {
            this.state = Math.max(this.state, (touch.force - minForce) / (maxForce - minForce));
        }
    }
    this.stateBuffer.setUint16(0, truncate(this.state * 0x8000), false);
    var changed = ((this.oldState == 0) != (this.state == 0));
    if (changed) {
        (this.state == 0) ? this.element.classList.remove('pressed') : this.element.classList.add('pressed');
    }
    this.oldState = this.state;
    return changed;
};
AnalogButton.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    this.oldState = 0;
    this.onTouchMove(ev);
    this.updateStateCallback();
};
AnalogButton.prototype.onTouchMove = function(ev) {
    var stateChanged = this.neighbors.map(function(el) {
        return el.processTouches(ev);
    }).reduce(function(acc, cur) {return acc || cur;}, false);
    this.updateStateCallback();
    if (stateChanged) {
        window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
    }

};
AnalogButton.prototype.onTouchEnd = function(ev) {
    this.neighbors.forEach(function(el) {
        el.processTouches(ev);
    });
    this.updateStateCallback();
};

function Knob(id, updateStateCallback) {
    Control.call(this, 'knob', id, updateStateCallback);
    this.state = 0.5;
    this.initState = 0.5; // state at onTouchStart
    this.initTransform = ''; // style.transform
    this.knobCircle = document.createElement('div');
    this.knobCircle.className = 'knobcircle';
    this.element.appendChild(this.knobCircle);
    this.circle = document.createElement('div');
    this.circle.className = 'circle';
    this.knobCircle.appendChild(this.circle);
}
Knob.prototype = Object.create(Control.prototype);
Knob.prototype.shape = 'square';
Knob.prototype.onAttached = function() {
    // Centering the knob within the boundary.
    this.knobCircle.style.top = this.offset.y + 'px';
    this.knobCircle.style.left = this.offset.x + 'px';
    this.knobCircle.style.height = this.offset.height + 'px';
    this.knobCircle.style.width = this.offset.width + 'px';
    this.updateCircles();
    this.octant = 0;
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), false);
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
};
Knob.prototype.onTouchMove = function(ev) {
    var pos = ev.targetTouches[0];
    // The knob now increments the state proportionally to the turned angle.
    // This requires subtracting the current angular position from the position at onTouchStart
    // A real knob turns the same way no matter where you touch it.
    this.state = (this.initState + (Math.atan2(pos.pageY - this.offset.yCenter,
        pos.pageX - this.offset.xCenter)) / (2 * Math.PI)) % 1;
    this.stateBuffer.setUint16(0, truncate(this.state * 0x8000), false);
    this.updateStateCallback();
    var currentOctant = Math.floor(this.state * 8);
    if (VIBRATE_ON_OCTANT_BOUNDARY && this.octant != currentOctant) {
        window.navigator.vibrate(VIBRATION_MILLISECONDS_OVER);
    }
    this.octant = currentOctant;
    this.updateCircles();
};
Knob.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    var pos = ev.targetTouches[0];
    this.initState = this.state - (Math.atan2(pos.pageY - this.offset.yCenter,
        pos.pageX - this.offset.xCenter) / (2 * Math.PI)) + 1;
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
};
Knob.prototype.onTouchEnd = function() {
    this.updateStateCallback();
    this.updateCircles();
};
Knob.prototype.updateCircles = function() {
    this.knobCircle.style.transform = 'rotate(' + ((this.state + 0.25) * 360) + 'deg)';
};

function Button(id, updateStateCallback) {
    Control.call(this, 'button', id, updateStateCallback);
    this.state = 0;
    this.oldState = 0;
    this.hitbox = document.createElement('div');
    this.hitbox.className = 'buttonhitbox';
    this.element.appendChild(this.hitbox);
}
Button.prototype = Object.create(Control.prototype);
Button.prototype.shape = 'overshoot';
Button.prototype.onAttached = AnalogButton.prototype.onAttached;
Button.prototype.processTouches = function(ev) {
    this.state = 0;
    for (var touch of ev.touches) {
        if (touch.pageX > this.offset.x && touch.pageX < this.offset.xMax &&
            touch.pageY > this.offset.y && touch.pageY < this.offset.yMax) {
            this.state = 1;
        }
    }
    var changed = ((this.oldState == 0) != (this.state == 0));
    if (changed) {
        (this.state == 1) ? this.element.classList.add('pressed') : this.element.classList.remove('pressed');
    }
    this.stateBuffer.setUint8(0, this.state);
    this.oldState = this.state;
    return changed;
};
Button.prototype.onTouchStart = AnalogButton.prototype.onTouchStart;
Button.prototype.onTouchMove = AnalogButton.prototype.onTouchMove;
Button.prototype.onTouchEnd = AnalogButton.prototype.onTouchEnd;
Button.prototype.setBufferView = function(cursor, buffer) {
    this.stateBuffer = new DataView(buffer, cursor, 1);
    return cursor + 1;
};

function DPad(id, updateStateCallback) {
    Control.call(this, 'dpad', id, updateStateCallback);
    this.state = [0, 0, 0, 0];
    this.oldState = -1;
}
DPad.prototype = Object.create(Control.prototype);
DPad.prototype.onAttached = function() {
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    this.element.addEventListener('touchcancel', this.onTouchEnd.bind(this), false);
    // Precalculate the borders of the buttons:
    this.offset.x1 = this.offset.xCenter - DPAD_BUTTON_WIDTH * this.offset.halfWidth;
    this.offset.x2 = this.offset.xCenter + DPAD_BUTTON_WIDTH * this.offset.halfWidth;
    this.offset.up_y = this.offset.y + DPAD_BUTTON_LENGTH * this.offset.height;
    this.offset.down_y = this.offset.yMax - DPAD_BUTTON_LENGTH * this.offset.height;
    this.offset.y1 = this.offset.yCenter - DPAD_BUTTON_WIDTH * this.offset.halfHeight;
    this.offset.y2 = this.offset.yCenter + DPAD_BUTTON_WIDTH * this.offset.halfHeight;
    this.offset.left_x = this.offset.x + DPAD_BUTTON_LENGTH * this.offset.width;
    this.offset.right_x = this.offset.xMax - DPAD_BUTTON_LENGTH * this.offset.width;
};
DPad.prototype.onTouchStart = function(ev) {
    ev.preventDefault(); // Android Webview delays the vibration without this.
    this.onTouchMove(ev);
};
DPad.prototype.onTouchMove = function(ev) {
    // up, left, down, right
    this.stateBuffer[0] = 0;
    this.stateBuffer[1] = 0;
    this.stateBuffer[2] = 0;
    this.stateBuffer[3] = 0;
    Array.from(ev.targetTouches, function(pos) {
        if (pos.pageX > this.offset.x1 && pos.pageX < this.offset.x2) {
            if (pos.pageY < this.offset.up_y && pos.pageY > this.offset.y) {
                this.stateBuffer[0] = 1;
            } else if (pos.pageY > this.offset.down_y && pos.pageY < this.offset.yMax) {
                this.stateBuffer[2] = 1;
            }
        }
        if (pos.pageY > this.offset.y1 && pos.pageY < this.offset.y2) {
            if (pos.pageX < this.offset.left_x && pos.pageX > this.offset.x) {
                this.stateBuffer[1] = 1;
            } else if (pos.pageX > this.offset.right_x && pos.pageX < this.offset.xMax) {
                this.stateBuffer[3] = 1;
            }
        }
    }, this);
    this.updateStateCallback();
    var currentState = this.stateBuffer.reduce(function(acc, cur) {return (acc << 1) + cur;}, 0);
    if (currentState != this.oldState) {
        this.oldState = currentState; this.updateButtons(currentState);
        window.navigator.vibrate(VIBRATION_MILLISECONDS_DPAD);
    }
};
DPad.prototype.onTouchEnd = function() {
    this.stateBuffer[0] = 0;
    this.stateBuffer[1] = 0;
    this.stateBuffer[2] = 0;
    this.stateBuffer[3] = 0;
    this.oldState = 0;
    this.updateStateCallback();
    this.updateButtons(0);
};
DPad.prototype.updateButtons = function(state) {
    switch (state) {
        case  0: this.element.className = 'control dpad';   break;
        case  1: this.element.className = 'control dpad r';   break;
        case  2: this.element.className = 'control dpad d';   break;
        case  4: this.element.className = 'control dpad l';   break;
        case  8: this.element.className = 'control dpad u';   break;
        case  3: this.element.className = 'control dpad dr';  break;
        case  6: this.element.className = 'control dpad dl';  break;
        case  9: this.element.className = 'control dpad ur';  break;
        case 12: this.element.className = 'control dpad ul';  break;
        default: this.element.className = 'control dpad all'; break;
    }
};
DPad.prototype.setBufferView = function(cursor, buffer) {
    this.stateBuffer = new Uint8Array(buffer, cursor, 4);
    return cursor + 4;
};

// JOYPAD:
function Joypad() {
    var updateStateCallback = this.updateState.bind(this);

    this.controls = {
        byNumID: [],
        byMnemonicID: {},
        deviceMotion: [],
        deviceOrientation: [],
        axes: 0,
        buttons: 0
    };

    this.element = document.getElementById('joypad');
    // Gather controls to attach:
    this.gridAreas = getComputedStyle(this.element)
        .gridTemplateAreas
        .replace(/ *["'] *["'] */g, '\n') // normalizes line breaks
        .replace(/ *["'] */g, '') // removes extra quotation marks and surrounding spaces
        .replace(/ {2,}/g, ' ') // normalizes spaces
        .trim();
    var controlIDs = this.gridAreas
        .split(/[ \n]/)
        .filter(function(x) { return x != '.'; })
        .sort(categories).filter(unique);
    // Create controls:
    this.debugLabel = null;
    controlIDs.forEach(function(id) {
        if (id != 'dbg') {
            var possibleControl = this.mnemonics(id, updateStateCallback);
            if (possibleControl !== null) {
                // Many references to the same control (not a copy):
                this.controls.byNumID.push(possibleControl);
                this.controls.byMnemonicID[id] = possibleControl;
                if (id == 'mx' || id == 'my' || id == 'mz') {
                    this.controls.deviceMotion.push(possibleControl);
                } else if (id == 'ma' || id == 'mb' || id == 'mg') {
                    this.controls.deviceOrientation.push(possibleControl);
                }
            }
        } else {
            this.debugLabel = new Control('debug', 'dbg');
            this.element.appendChild(this.debugLabel.element);
        }
    }, this);
    // this.updateDebugLabel() is a NO-OP until needed:
    this.debugMessage = '';
    if (!DEBUG_NO_CONSOLE_SPAM || this.debugLabel != null) {
        this.updateDebugLabel = function() {
            var dump = this.stateBytes.reduce(
                function(acc, cur) {
                    return acc + cur.toString(16).padStart(2, '0') + ':';
                }, ':'
            );
            if (this.debugLabel != null) {
                this.debugLabel.element.innerHTML = dump + '<br/>' + this.debugMessage;
            }
            if (!DEBUG_NO_CONSOLE_SPAM) {console.log(dump + '\n' + this.debugMessage);}
        };
    }
    // Prepare template for sending joypad state:
    this.stateBuffer = new ArrayBuffer(1 + 2 * this.controls.axes + this.controls.buttons);
    this.stateBytes = new Uint8Array(this.stateBuffer);
    // Declare a disconnection pattern.
    this.stateBytes[0] = 255;
    window.Yoke.set_bye(serializer.decode(this.stateBuffer));
    // Now set a different header for regular status reports (also defined at `service.py`):
    this.stateBytes[0] = 0;
    // Attach controls:
    var cursor = 1;
    this.controls.byNumID.forEach(function(c) {
        this.element.appendChild(c.element);
        cursor = c.setBufferView(cursor, this.stateBuffer);
        c.getBoundingClientRect();
        c.onAttached();
    }, this);
    // Check for controls:
    if (this.controls.byNumID.length == 0) {
        window.Yoke.alert('Your gamepad looks empty. Is `user.css` missing or broken?');
    }
    // Prepare general and shared event listeners:
    if (this.controls.deviceMotion.length > 0) {
        window.addEventListener('devicemotion', Motion.prototype.onDeviceMotion, true);
    }
    if (this.controls.deviceOrientation.length > 0) {
        window.addEventListener('deviceorientation', Motion.prototype.onDeviceOrientation, true);
    }
    // Users may press two buttons at the same time, or slide the finger towards neighboring buttons.
    // Overlapping buttons will respond to this, but faraway buttons will not.
    // This limit may change in the future.
    this.controls.byNumID.forEach(function(c, _, arr) {
        if (c.element.id[0] == 'b' || c.element.id[0] == 'a') {
            c.neighbors = arr.filter(function(p) {
                if (p.element.id[0] != 'b' && p.element.id[0] != 'a') {
                    return false;
                }
                if (c.offset.x > p.offset.xMax ||
                    c.offset.xMax < p.offset.x ||
                    c.offset.y > p.offset.yMax ||
                    c.offset.yMax < p.offset.y) {
                    return false;
                }
                return true;
            });
        }
    }, this);
    // Announce current controls:
    var kernelEvents = this.controls.byNumID.map(function(c) { return c.element.id; }).join(',');
    if (this.debugLabel != null) {
        this.debugLabel.element.innerHTML = kernelEvents + '<br/>' + this.debugMessage;
    }
    if (!DEBUG_NO_CONSOLE_SPAM) { console.log(kernelEvents + '\n' + this.debugMessage); }
    // Send current controls to Yoke:
    window.Yoke.update_vals(kernelEvents);
    // Prepare function for continuous vibrations:
    checkVibration();
}
Joypad.prototype.updateState = function() {
    window.Yoke.update_vals(serializer.decode(this.stateBuffer));
    this.updateDebugLabel();
};
Joypad.prototype.updateDebugLabel = function() {}; //dummy function
Joypad.prototype.mnemonics = function(id, callback) {
    // Chooses the correct control for the joypad from its mnemonic code.
    var legalLabels = '';
    if (id.length < 2 || id.length > 3) {
        window.Yoke.alert('`' + id + '` is not a valid code. Control codes have 2 or 3 characters.');
        return null;
    } else {
        /*eslint no-fallthrough: "error"*/
        switch (id[0]) {
            case 't':
                // 't' is a thumbstick with L3/R3 button
                this.controls.buttons += 1;
                // falls through
            case 's': case 'j':
                // 's' is a locking joystick, 'j' - non-locking
                this.controls.axes += 2;
                return new Joystick(id, callback);
            case 'm':
                legalLabels = 'xyzabg';
                if (legalLabels.indexOf(id[1]) == -1) {
                    window.Yoke.alert('Motion detection error: \
                        Unrecognised coordinate `' + id[1] + '`.');
                    return null;
                } else {
                    if (id.length != 2) { window.Yoke.alert('Please use only one coordinate per motion sensor.'); }
                    this.controls.axes += 1;
                    return new Motion(id, callback);
                }
            case 'p':
                legalLabels = 'abt';
                if (legalLabels.indexOf(id[1]) == -1) {
                    window.Yoke.alert('`' + id + '` is not a valid pedal. \
                        Please use `pa` or `pt` for accelerator \
                        and `pb` for brakes.');
                    return null;
                } else {
                    this.controls.axes += 1;
                    return new Pedal(id, callback);
                }
            case 'k':
                this.controls.axes += 1;
                return new Knob(id, callback);
            case 'a':
                this.controls.axes += 1;
                return new AnalogButton(id, callback);
            case 'b':
                this.controls.buttons += 1;
                return new Button(id, callback);
            case 'd':
                if (id != 'dp') {
                    window.Yoke.alert('D-pads are now produced with the code `dp`. \
                        Please update your layout.');
                    return null;
                } else {
                    this.controls.buttons += 4;
                    return new DPad(id, callback);
                }
            default:
                window.Yoke.alert('Unrecognised control `' + id + '` at user.css.');
                return null;
        }
    }
};


// BASE CODE:
// These variables are automatically updated by the code:
var joypad = null;
var motionState = [0, 0, 0, 0, 0, 0];

// These will record the minimum and maximum force the screen can register.
// They'll hopefully be updated with the actual minimum and maximum:
var minForce = 1;
var maxForce = 0;
// And this, for the moment, is only used for the thumb joysticks.
// By default, it's set to the arithmetic mean of minForce and maxForce.
var midForce = 0.5;

// This function updates minForce and maxForce if the force is not exactly 0 or 1.
// If minForce is not less than maxForce after a touch event,
// the touchscreen can't detect finger pressure, even if it reports it can.
function recordPressure(ev) {
    var force = ev.targetTouches[0].force;
    if (force > 0 && force < 1) {
        minForce = Math.min(minForce, force);
        maxForce = Math.max(maxForce, force);
        midForce = (minForce + maxForce) / 2;
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
            joypad.controls.byNumID.forEach(function(c) {
                c.getBoundingClientRect();
                c.onAttached();
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
        if (window.CSS && CSS.supports('display', 'grid')) {
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
                    AnalogButton.prototype.processTouches = AnalogButton.prototype.processTouchesForce;
                    Joystick.prototype.checkThumbButton = Joystick.prototype.checkThumbButtonForce;
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
var warningDiv = document.getElementById('warning');
document.getElementById('menu').childNodes.forEach(function(child) {
    var id = child.id;
    if (id) {
        child.addEventListener('click', function() { loadPad(id + '.css'); });
        child.addEventListener('touchstart', recordPressure);
        child.addEventListener('touchmove', recordPressure);
    }
});
