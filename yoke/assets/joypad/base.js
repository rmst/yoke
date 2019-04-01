'use strict';
// those 3 are recommended for non-kiosk/non-embedded browsers
let WAIT_FOR_FULLSCREEN = false;
let DEBUG_NO_SPAM = true;
let DEBUG_MSG_LABEL = false;

let VIBRATION_MILLISECONDS_IN  = 50;
let VIBRATION_MILLISECONDS_OUT = 50;

function Control(type, id, updateStateCallback) {
    //constructor(type, id, updateStateCallback) {
    this.element = document.createElement('div');
    this.element.className = 'control ' + type;
    this.element.id = id;
    this.element.style.gridArea = id;
    this.gridArea = id;
    this.updateStateCallback = updateStateCallback;
    //}
}
Control.prototype.onAttached = function() { };
Control.prototype.state = function() { };

function Joystick(id, updateStateCallback) {
    //constructor(id, updateStateCallback) {
    Control.call(this, 'joystick', 'j' + id, updateStateCallback);
    this._stateX = 0.5;
    this._stateY = 0.5;
    this._locking = false;
    this._offset = {};
    this._circle = document.createElement('div');
    this._circle.className = 'circle';
    this._circle.style.top = '99999px';
    this.element.appendChild(this._circle);
    //}
}
Joystick.prototype = Object.create(Control.prototype);
Joystick.prototype.onAttached = function() {
    this._locking = getComputedStyle(this.element)['animation-name'] == 'locking';
    this._offset = this.element.getBoundingClientRect();
    this._updateCircle();
    this.element.addEventListener('touchmove', this.onTouch.bind(this), false);
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
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
    // constructor(id, updateStateCallback) {
    Control.call(this, 'button', 'b' + id, updateStateCallback);
    this._state = 0;
    // }
}

Button.prototype = Object.create(Control.prototype);
Button.prototype.onAttached = function() {
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), false);
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
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

function Compass(id, updateStateCallback) {
    Control.call(this, 'compass', 'c' + id, updateStateCallback);
    this._stateBeta = 0.5;
    this._stateGamma = 0.5;
}

Compass.prototype = Object.create(Control.prototype);
Compass.prototype.onAttached = function() {
    window.addEventListener('devicemotion', Compass.prototype.onDeviceMotion, false)
}
Compass.prototype.onDeviceMotion = function(ev) {
    this._stateGamma = (ev.gamma + 180) / 360;
    this._stateBeta = (ev.beta + 90) / 180;
}
Compass.prototype.state = function () {
    return this._stateBeta.toString() + ',' + this._stateGamma.toString();
}

function Joypad() {
    let updateStateCallback = this.updateState.bind(this);

    this._controls = [
        new Joystick('l', updateStateCallback),
        new Joystick('r', updateStateCallback),
        /* EXPERIMENTAL! If you want to try, comment the right joystick, and uncomment this.
         * Don't forget to change 'jr' to 'cr' in user.css, too. */
        // new Compass('r', updateStateCallback),
    ];
    for (let i = 1; i <= 32; i++) {
        this._controls.push(new Button(i, updateStateCallback));
    }

    let joypad = document.getElementById('joypad');
    let gridAreas = getComputedStyle(joypad)
        .gridTemplateAreas
        .split('"').join('')
        .split(' ')
        .filter(function (x) {return x != '' && x != '.'});
    let thereAreNoControls = true;
    this._controls.forEach(function (control) {
        if (gridAreas.includes(control.gridArea)) {
            joypad.appendChild(control.element);
            control.onAttached();
            thereAreNoControls = false;
        }
    });
    if (thereAreNoControls) {
        // joypad.style.display = "inline";
        joypad.innerHTML += "You don't seem to have any controls in your gamepad. Is <code>user.css</code> missing or broken?";
    };

    if (DEBUG_MSG_LABEL) {
        this._debugLabel = new Control('debug', 'dbg');
        this._debugLabel.element.style.wordWrap = "break-word";
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

let joypad = null;
let btn = null;

window.addEventListener('resize', function () {
    if(joypad != null){
        joypad._controls.forEach(function (control) {
            control.onAttached();
        });
    }
})

window.addEventListener('load', function () {
    if (window.CSS && CSS.supports('display', 'grid')) {
        document.getElementById('joypad').innerHTML = '';
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
