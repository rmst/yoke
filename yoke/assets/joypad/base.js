'use strict';
// those 3 are recommended for non-kiosk/non-embedded browsers
let WAIT_FOR_FULLSCREEN = false;
let DEBUG_NO_SPAM = true;
let DEBUG_MSG_LABEL = true;

let VIBRATION_MILLISECONDS_IN  = 50;
let VIBRATION_MILLISECONDS_OUT = 50;
let VELOCITY_CONSTANT = 4000;

//
// MISCELLANEOUS HELPER FUNCTIONS
//
function prettyAlert(message) {
    let warningDiv = document.getElementById('warning');
    warningDiv.innerHTML = message + '<p class="dismiss">Tap to dismiss.</p>'
    warningDiv.style.display = 'inline'
}

// https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates#14438954
function unique(value, index, self) { 
    return self.indexOf(value) === index;
}

function mnemonics(a, b) {
    let callback, ids
    if (typeof b == 'function') {
      // if b is a callback function, mnemonics() chooses the correct control for the joypad
      callback = b;
      ids = [a];
    } else if (typeof b == 'string') {
      // if b is a string, mnemonics() serves as a custom sorting algorithm
      callback = null;
      ids = [a, b]
    } else {
      prettyAlert(
          'FATAL JAVASCRIPT ERROR: \
          in mnemonics(a, b), b can only be a function or a string.<br>\
          Please consult the developers.'
      )
    }
    let sortScores = ids.slice();
    // sortScores contains arbitrary numbers.
    // These only matter if mnemonics() is being used as a sort function;
    // the lower-ranking controls are attached earlier.
    ids.forEach(function (id, i) {
        if (id == "dbg") {sortScores[i] = 998} else {
            sortScores[i] = 997;
            switch (id[0]) {
                case 'j':
                    if (typeof callback == 'function') {
                      sortScores[i] = new Joystick(id, callback);
                    } else {sortScores[i] = 100};
                    break
                case 'm':
                    if (typeof callback == 'function') {
                      sortScores[i] = new Motion(id, callback)
                    } else {sortScores[i] = 200};
                    break
                case 'p':
                    if (typeof callback == 'function') {
                      sortScores[i] = new Pedal(id, callback)
                    } else {sortScores[i] = 300};
                    break
                case 'b':
                    if (typeof callback == 'function') {
                      sortScores[i] = new Button(id, callback)
                    } else {sortScores[i] = 600};
                    break
                default:
                    sortScores[i] = 999;
                    prettyAlert('Unrecognised control <code>' + id + '</code> at user.css.');
                    break
            }
            if (sortScores[i] < 990) {sortScores[i] += Number(id.substring(1));};
        }
    });
    if (typeof callback == 'function') {
      return sortScores[0]
    } else {
      if (sortScores[0] < sortScores[1]) {return -1;} else {return 1;}
    }
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
}
Control.prototype.onAttached = function() { };
Control.prototype.state = function() { };

function Joystick(id, updateStateCallback) {
    Control.call(this, 'joystick', id, updateStateCallback);
    this._stateX = 0.5;
    this._stateY = 0.5;
    this._locking = false;
    this._offset = {};
    this._circle = document.createElement('div');
    this._circle.className = 'circle';
    this._circle.style.top = '99999px';
    this.element.appendChild(this._circle);
}
Joystick.prototype = Object.create(Control.prototype);
Joystick.prototype.onAttached = function() {
    this._locking = getComputedStyle(this.element)['animation-name'] == 'locking';
    this._offset = this.element.getBoundingClientRect();
    this._updateCircle();
    this.element.addEventListener('touchmove', this.onTouch.bind(this), false);
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    axes += 2;
}
Joystick.prototype.onTouch = function(ev) {
    let pos = ev.targetTouches[0];
    this._stateX = this._truncate((pos.pageX - this._offset.x) / this._offset.width);
    this._stateY = this._truncate((pos.pageY - this._offset.y) / this._offset.height);
    this._updateCircle();
    this.updateStateCallback();
}
Joystick.prototype.onTouchStart = function (ev) {
    this.onTouch(ev);
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
}
Joystick.prototype.onTouchEnd = function() {
    if (!this._locking) {
        this._stateX = 0.5;
        this._stateY = 0.5;
        this._updateCircle();
        this.updateStateCallback();
    }
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
}
Joystick.prototype.state = function() {
    return this._stateX.toString() + ',' + this._stateY.toString();
}
Joystick.prototype._truncate = function(f) {
    if (f < 0) {window.navigator.vibrate(VIBRATION_MILLISECONDS_IN); return 0;};
    if (f > 1) {window.navigator.vibrate(VIBRATION_MILLISECONDS_IN); return 1;};
    return f;
}
Joystick.prototype._updateCircle = function () {
    this._circle.style.left = (this._offset.x + this._offset.width * this._stateX) + 'px';
    this._circle.style.top = (this._offset.y + this._offset.height * this._stateY) + 'px';
}

function Button(id, updateStateCallback) {
    Control.call(this, 'button', id, updateStateCallback);
    this._state = 0;
}
Button.prototype = Object.create(Control.prototype);
Button.prototype.onAttached = function() {
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    buttons += 1;
}
Button.prototype.onTouchStart = function () {
    this._state = 1;
    this.updateStateCallback();
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
}
Button.prototype.onTouchEnd = function () {
    this._state = 0;
    this.updateStateCallback();
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
}
Button.prototype.state = function () {
    return this._state.toString();
}

function Motion(id, updateStateCallback) {
    Control.call(this, 'motion', id, updateStateCallback);
    this._stateAlpha = 0.5;
    this._stateBeta = 0.5;
    this._stateGamma = 0.5;
    this._stateX = 0.5;
    this._stateY = 0.5;
    this._stateZ = 0.5;
    this._interval = 0;
}
Motion.prototype = Object.create(Control.prototype);
Motion.prototype._truncate = function(f) {
    if (f < -0.5) {f = -0.5;};
    if (f > 0.5) {f = 0.5;};
    return f + 0.5;
}
Motion.prototype.onAttached = function() {
    window.addEventListener('devicemotion', Motion.prototype.onDeviceMotion.bind(this), true)
    axes += 2;
}
Motion.prototype.onDeviceMotion = function(ev) {
    this._interval = ev.interval;
    this._stateAlpha += ev.rotationRate.alpha / 180000 * this._interval;
    this._stateBeta += ev.rotationRate.beta / 180000 * this._interval;
    this._stateGamma += ev.rotationRate.gamma / 360000 * this._interval;
    this._stateX = Motion.prototype._truncate(ev.accelerationIncludingGravity.x / VELOCITY_CONSTANT * this._interval);
    this._stateY = Motion.prototype._truncate(ev.accelerationIncludingGravity.y / VELOCITY_CONSTANT * this._interval);
    this._stateZ = Motion.prototype._truncate(ev.accelerationIncludingGravity.z / VELOCITY_CONSTANT * this._interval);
    this.updateStateCallback();
}
Motion.prototype.onDeviceOrientation = function(ev) {
}
Motion.prototype.state = function () {
    return this._stateX.toString() + ',' + this._stateGamma.toString();
}

function Pedal(id, updateStateCallback) {
    Control.call(this, 'button', id, updateStateCallback);
    this._state = 0;
    this._offset = {};
}
Pedal.prototype = Object.create(Control.prototype);
Pedal.prototype._truncate = function(f) {
    if (f < 0) {return 0;};
    if (f > 1) {return 1;};
    return f;
}
Pedal.prototype.onAttached = function() {
    this._offset = this.element.getBoundingClientRect();
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    axes += 1;
}
Pedal.prototype.onTouchStart = function (ev) {
    window.navigator.vibrate(VIBRATION_MILLISECONDS_IN);
    this.onTouchMove(ev);
}
Pedal.prototype.onTouchMove = function (ev) {
    /*
    //Some screens can detect finger pressure, but not all, and it's difficult to calibrate and detect support.
    this._state = ev.touches[0].force;
    if (this._state == 0) {this.state = 0.5};
    */
    // Detection based on Y-coordinate, on the other hand, is intuitive and reliable in any device:
    let pos = ev.targetTouches[0];
    this._state = this._truncate((this._offset.y - pos.pageY) / this._offset.height + 1);
    this.updateStateCallback();
}
Pedal.prototype.onTouchEnd = function (ev) {
    this._state = 0;
    this.updateStateCallback();
    window.navigator.vibrate(VIBRATION_MILLISECONDS_OUT);
}
Pedal.prototype.state = function () {
    return this._state.toString();
}

function Dummy(id, updateStateCallback){
    Control.call(this, 'dummy', 'dum', updateStateCallback);
}
Dummy.prototype = Object.create(Control.prototype);
Dummy.prototype.onAttached = function() {buttons += 1};
Dummy.prototype.state = function () { return '0'; }

//
// JOYPAD
//
function Joypad() {
    let updateStateCallback = this.updateState.bind(this);

    this._controls = [ ];

    let joypad = document.getElementById('joypad');
    let gridAreas = getComputedStyle(joypad)
        .gridTemplateAreas
        .split('"').join('')
        .split(' ')
        .filter(function (x) {return x != '' && x != '.'});
    let controlIDs = gridAreas.sort(mnemonics).filter(unique);
    controlIDs.forEach(function (id) {
        if (id != 'dbg') {
          this._controls.push(mnemonics(id, updateStateCallback))
        };
    }, this);
    this._controls.forEach(function (control) {
        joypad.appendChild(control.element);
        control.onAttached();
    });
    if (axes == 0 && buttons == 0) {
        prettyAlert("You don't seem to have any controls in your gamepad. Is <code>user.css</code> missing or broken?");
    };
    // This section is to be excised later 
    if (axes != 4) {
        prettyAlert('Currently, Yoke requires precisely 4 axes: please edit your CSS to incorporate two joysticks, or one joystick and a motion sensor.')
    }
    if (buttons > 32) {
        prettyAlert('Currently, Yoke allows a maximum of 32 buttons.')
    } else {
        for (buttons; buttons < 32; buttons++) {
            this._controls.push(new Dummy('dum', updateStateCallback));
        }
    }
    // end of section to be deleted

    if (DEBUG_MSG_LABEL) {
        this._debugLabel = new Control('debug', 'dbg');
        joypad.appendChild(this._debugLabel.element);
    }
}
Joypad.prototype.updateState = function () {
    let state = this._controls.map(function (control) {return control.state()}).join(',');

    Yoke.update_vals(state);  // only works in yoke webview

    if (DEBUG_MSG_LABEL) {
        this._debugLabel.element.innerHTML = state;
    }
    if (!DEBUG_NO_SPAM) {
        console.log(state)
    }
}

//
// BASE CODE
//
let joypad = null;
let btn = null;
let buttons = 0; // number of buttons total
let axes = 0; // number of analog axes total

window.addEventListener('resize', function () {
    if(joypad != null){
        joypad._controls.forEach(function (control) {
            control.onAttached();
        });
    }
})

window.addEventListener('load', function () {
    let warningDiv = document.getElementById('warning')
    if (window.CSS && CSS.supports('display', 'grid')) {
        warningDiv.addEventListener('click', function () {warningDiv.style.display = 'none'}, false);
        warningDiv.style.display = 'none';
    };
    let el = document.documentElement;
    let rfs = el.requestFullScreen
        || el.webkitRequestFullScreen
        || el.mozRequestFullScreen
        || el.msRequestFullscreen;
    if (rfs && WAIT_FOR_FULLSCREEN) {
        // https://stackoverflow.com/a/7966541/5108318
        // https://stackoverflow.com/a/38711009/5108318
        // https://stackoverflow.com/a/25876513/5108318
        let btn = document.createElement('button');
        btn.innerHTML = 'click';
        btn.addEventListener('click', function () {
            rfs.bind(el)()
            this.parentNode.removeChild(this);
            setTimeout(function () {new Joypad()}, 1000);
        });
        document.getElementById('joypad').appendChild(btn);
    } else {
        joypad = new Joypad();
    }
});
