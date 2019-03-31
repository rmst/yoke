// those 3 are recommended for non-kiosk/non-embedded browsers
const WAIT_FOR_FULLSCREEN = false;
const DEBUG_NO_SPAM = true;
const DEBUG_MSG_LABEL = true;

const SHOW_CIRCLE = true;

class Control {
    constructor(type, id, updateStateCallback) {
        this.element = document.createElement('div');
        this.element.className = 'control ' + type;
        this.element.id = id;
        this.element.style.gridArea = id;
        this.element.addEventListener('touchstart', this.onTouch.bind(this), false);
        this.element.addEventListener('touchmove', this.onTouch.bind(this), false);
        this.element.addEventListener('touchend', this.onTouchEnd.bind(this), false);
        this.gridArea = id;
        this.updateStateCallback = updateStateCallback;
    }
    onAttached() { }
    onTouch() { }
    onTouchEnd() { }
    state() { }
}

class Joystick extends Control {
    constructor(id, updateStateCallback) {
        super('joystick', 'j' + id, updateStateCallback);
        this._stateX = 0.5;
        this._stateY = 0.5;
        this._locking = false;
        this._offset = {};
        if (SHOW_CIRCLE) {
            this._circle = document.createElement('div');
            this._circle.className = 'circle';
            this._circle.style.top = '99999px';
            this.element.appendChild(this._circle);
        }
    }
    onAttached() {
        this._locking = getComputedStyle(this.element)['animation-name'] == 'locking';
        this._offset = this.element.getBoundingClientRect();
        this._updateCircle();
    }
    onTouch(ev) {
        let pos = ev.targetTouches[0];
        this._stateX = this._truncate((pos.pageX - this._offset.x) / this._offset.width);
        this._stateY = this._truncate((pos.pageY - this._offset.y) / this._offset.height);
        this._updateCircle();
        this.updateStateCallback();
    }
    onTouchEnd() {
        if (!this._locking) {
            this._stateX = 0.5;
            this._stateY = 0.5;
            this._updateCircle();
            this.updateStateCallback();
        }
    }
    state() {
        return this._stateX.toString() + ',' + this._stateY.toString();
    }
    _truncate(f) {
        if (f < 0) return 0;
        if (f > 1) return 1;
        return f;
    }
    _updateCircle() {
        this._circle.style.left = (this._offset.x + this._offset.width * this._stateX) + 'px';
        this._circle.style.top = (this._offset.y + this._offset.height * this._stateY) + 'px';
    }
}

class Button extends Control {
    constructor(id, updateStateCallback) {
        super('button', 'b' + id, updateStateCallback);
        this._state = 0;
    }
    onTouch() {
        this._state = 1;
        this.updateStateCallback();
    }
    onTouchEnd() {
        this._state = 0;
        this.updateStateCallback();
    }
    state() {
        return this._state.toString();
    }
}

class Joypad {
    constructor() {
        let updateStateCallback = this.updateState.bind(this);

        this._controls = [
            new Joystick('l', updateStateCallback),
            new Joystick('r', updateStateCallback),
        ];
        for (let i = 1; i <= 32; i++) {
            this._controls.push(new Button(i, updateStateCallback));
        }

        let joypad = document.getElementById('joypad');
        let gridAreas = getComputedStyle(joypad)
            .gridTemplateAreas
            .split('"').join('')
            .split(' ')
            .filter(x => x != '' && x != '.');
        this._controls.forEach(control => {
            if (gridAreas.includes(control.gridArea)) {
                joypad.appendChild(control.element);
                control.onAttached();
            }
        });

        if (DEBUG_MSG_LABEL) {
            this._debugLabel = new Control('debug', 'dbg');
            this._debugLabel.element.style.wordWrap = "break-word";
            joypad.appendChild(this._debugLabel.element);
        }
    }
    updateState() {
        let state = this._controls.map(control => control.state()).join(',');

        Yoke.update_vals(state);  // only works in yoke webview

        if (DEBUG_MSG_LABEL) {
            this._debugLabel.element.innerHTML = state;
        }
        if (!DEBUG_NO_SPAM) {
            console.log(state);
        }
    }
}

var joypad = null;

window.addEventListener('resize', () => {
    if(joypad != null){
        joypad._controls.forEach(control => {
            control.onAttached();
        });
    }
})

window.addEventListener('load', () => {
    if (WAIT_FOR_FULLSCREEN) {
        // https://stackoverflow.com/a/7966541/5108318
        // https://stackoverflow.com/a/38711009/5108318
        // https://stackoverflow.com/a/25876513/5108318
        let el = document.documentElement;
        let rfs = el.requestFullScreen
            || el.webkitRequestFullScreen
            || el.mozRequestFullScreen
            || el.msRequestFullscreen;
        let btn = document.createElement('button');
        btn.innerHTML = 'click';
        btn.addEventListener('click', () => rfs.bind(el)());
        document.getElementById('joypad').appendChild(btn);
        let exitHandler = () => {
            btn.parentNode.removeChild(btn);
            setTimeout(() => new Joypad(), 1000);
        }
        document.addEventListener('webkitfullscreenchange', exitHandler, false);
        document.addEventListener('mozfullscreenchange', exitHandler, false);
        document.addEventListener('fullscreenchange', exitHandler, false);
        document.addEventListener('MSFullscreenChange', exitHandler, false);
    } else {
        joypad = new Joypad();
    }
});