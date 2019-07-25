from zeroconf import ServiceBrowser, Zeroconf, InterfaceChoice, ServiceInfo
import socket

from time import sleep, time
from platform import system
import atexit

from yoke import events as EVENTS

ALIAS_TO_EVENT = {
    'j1':  'ABS_X,ABS_Y',
    'j2':  'ABS_RX,ABS_RY',
    'j3':  'ABS_MISC,ABS_MAX',
    's1':  'ABS_X,ABS_Y',
    's2':  'ABS_RX,ABS_RY',
    's3':  'ABS_TOOL_WIDTH,ABS_MAX',
    'mx':  'ABS_MISC',
    'my':  'ABS_RZ',
    'mz':  'ABS_Z',
    'ma':  'ABS_TILT_X',
    'mb':  'ABS_WHEEL',
    'mg':  'ABS_TILT_Y',
    'pa':  'ABS_GAS',
    'pb':  'ABS_BRAKE',
    'pt':  'ABS_THROTTLE',
    'k1':  'ABS_VOLUME',
    'k2':  'ABS_RUDDER',
    'k3':  'ABS_PRESSURE',
    'k4':  'ABS_DISTANCE',
    'a1':  'ABS_HAT0X',
    'a2':  'ABS_HAT0Y',
    'a3':  'ABS_HAT1X',
    'a4':  'ABS_HAT1Y',
    'a5':  'ABS_HAT2X',
    'a6':  'ABS_HAT2Y',
    'a7':  'ABS_HAT3X',
    'a8':  'ABS_HAT3Y',
    'bs':  'BTN_START',
    'bg':  'BTN_SELECT',
    'bm':  'BTN_MODE',
    'b1':  'BTN_GAMEPAD',
    'b2':  'BTN_EAST',
    'b3':  'BTN_WEST',
    'b4':  'BTN_NORTH',
    'b5':  'BTN_TL',
    'b6':  'BTN_TR',
    'b7':  'BTN_TL2',
    'b8':  'BTN_TR2',
    'b9':  'BTN_A',
    'b10': 'BTN_B',
    'b11': 'BTN_C',
    'b12': 'BTN_X',
    'b13': 'BTN_Y',
    'b14': 'BTN_Z',
    'b15': 'BTN_TOP',
    'b16': 'BTN_TOP2',
    'b17': 'BTN_PINKIE',
    'b18': 'BTN_BASE',
    'b19': 'BTN_BASE2',
    'b20': 'BTN_BASE3',
    'b21': 'BTN_BASE4',
    'b22': 'BTN_BASE5',
    'b23': 'BTN_BASE6',
    'b24': 'BTN_THUMB',
    'b25': 'BTN_THUMB2',
    'b26': 'BTN_TRIGGER',
    'du':  'BTN_DPAD_UP',
    'dd':  'BTN_DPAD_DOWN',
    'dl':  'BTN_DPAD_LEFT',
    'dr':  'BTN_DPAD_RIGHT',
}

def get_ip_address():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    ip = s.getsockname()[0]
    s.close()
    return ip

from glob import glob


ABS_EVENTS = [getattr(EVENTS, n) for n in dir(EVENTS) if n.startswith('ABS_')]

class Device:
    def __init__(self, id=1, name='Yoke', events=(), bytestring=b'!impossible?aliases#string$'):
        self.name = name + '-' + str(id)
        for fn in glob('/sys/class/input/js*/device/name'):
            with open(fn) as f:
                fname = f.read().split()[0]  # need to split because there seem to be newlines
                if name == fname:
                    raise AttributeError('Device name "{}" already taken. Set another name with --name NAME'.format(name))

        # set range (0, 255) for abs events
        self.events = events
        self.bytestring = bytestring
        events = [e + (0, 255, 0, 0) if e in ABS_EVENTS else e for e in events]

        BUS_VIRTUAL = 0x06
        import uinput

        self.device = uinput.Device(events, name, BUS_VIRTUAL)

    def emit(self, d, v):
        if d not in self.events:
            print('Event {d} has not been registered... yet?')
        self.device.emit(d, int(v), False)

    def flush(self):
        self.device.syn()

    def close(self):
        self.device.destroy()


# Override on Windows
if system() is 'Windows':
    print('Warning: This is not well tested on Windows!')

    from yoke.vjoy.vjoydevice import VjoyConstants, VjoyDevice

    class Device:
        def __init__(self, id=1, name='Yoke', events=(), bytestring=b'!impossible?aliases#string$'):
            super().__init__()
            self.name = name + '-' + str(id)
            self.device = VjoyDevice(id)
            self.events = []
            self.bytestring = bytestring
            #a vJoy controller has up to 8 axis with fixed names, and 128 buttons with no names.
            #TODO: Improve mapping between uinput events and vJoy controls.
            axes = 0x2f
            buttons = 0
            for event in events:
                if event[0] == 0x01: # button/key
                    buttons += 1; self.events.append((event[0], buttons));
                elif event[0] == 0x03: # analog axis
                    axes += 1; self.events.append((event[0], axes));
        def emit(self, d, v):
            if d is not None:
                if d[0] == 0x03: #analog axis
                    # To map from [0, 255] to [0x1, 0x8000], take the bitstring abcdefgh,
                    # parse the bitstring abcdefghabcdefg, and then sum 1.
                    self.device.set_axis(d[1], ((v << 7) | (v >> 1)) + 1)
                else:
                    self.device.set_button(d[1], v)
        def flush(self):
            pass
        def close(self):
            self.device.close()


zeroconf = Zeroconf()


# Webserver to serve files to android client
from http.server import HTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import socketserver
import os, urllib, posixpath

# TODO: These three lines allow using the syntax with socketserver with
# old versions of Python like in Debian.
# Please delete once socketserver.py is updated in every major Linux distro.
if not "__enter__" in dir(socketserver.BaseServer):
    socketserver.BaseServer.__enter__ = lambda self: self
    socketserver.BaseServer.__exit__ = lambda self, *args: self.server_close()

class HTTPRequestHandler(SimpleHTTPRequestHandler):
    basepath = os.getcwd()

    def translate_path(self, path):
        """Translate a /-separated PATH to the local filename syntax."""
        # abandon query parameters
        path = path.split('?',1)[0]
        path = path.split('#',1)[0]
        # Don't forget explicit trailing slash when normalizing. Issue17324
        trailing_slash = path.rstrip().endswith('/')
        try:
            path = urllib.parse.unquote(path, errors='surrogatepass')
        except UnicodeDecodeError:
            path = urllib.parse.unquote(path)
        path = posixpath.normpath(path)
        words = path.split('/')
        words = filter(None, words)
        path = self.basepath
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                # Ignore components that are not a simple file/directory name
                continue
            path = os.path.join(path, word)
        if trailing_slash:
            path += '/'
        return path

def run_webserver(port, path):
    print('starting webserver on ', port, path)
    class RH(HTTPRequestHandler):
        basepath = path
    with socketserver.TCPServer(('', port), RH) as httpd:
        httpd.serve_forever()


DEFAULT_CLIENT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'yoke', 'assets', 'joypad')

class Service:
    sock = None
    info = None
    name = None
    devid = None
    dt = 0.02

    def __init__(self, devname='Yoke', devid='1', iface='auto', port=0, client_path=DEFAULT_CLIENT_PATH):
        self.dev = Device(devid, devname)
        self.name = devname
        self.devid = devid
        self.iface = iface
        self.port = port
        self.client_path = client_path

    def preprocess(self, message, expectedlength):
        v = message.split(b',')
        v = tuple([int(m) for m in v])
        if len(v) < expectedlength:
            # Before reducing float precision, sometimes UDP messages were getting cut in half.
            # Keeping the code just in case.
            print('malformed message!')
            print(v)
            v += (0,) * (expectedlength - len(v))
        elif len(v) > expectedlength:
            v = v[0:expectedlength]
        return v

    def run(self):
        atexit.register(self.close_atexit)

        if self.iface == 'auto':
            self.iface = get_ip_address()

        # open udp socket on random available port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 128)  # small buffer for low latency
        self.sock.bind((self.iface, self.port))
        self.sock.settimeout(0)
        adr, port = self.sock.getsockname()
        self.port = port

        Thread(target=run_webserver, args=(self.port, self.client_path), daemon=True).start()

        # create zeroconf service
        stype = '_yoke._udp.local.'
        netname = socket.gethostname() + '-' + self.dev.name
        fullname = netname + '.' + stype
        self.info = ServiceInfo(stype, fullname, socket.inet_aton(adr), port, 0, 0, {}, fullname)
        zeroconf.register_service(self.info, ttl=10)
        while True:
            print('To connect select "{}" on your device,'.format(netname))
            print('or connect manually to "{}:{}"'.format(adr, port))
            trecv = time()
            irecv = 0
            connection = None

            while True:
                try:
                    m, address = self.sock.recvfrom(128)

                    if connection is None:
                        print('Connected to ', address)
                        connection = address

                    if connection == address:
                        trecv = time()
                        irecv = 0
                        # If the message begins with a lowercase letter, it is a layout.
                        # If it's different than the current one, replace device.
                        if (m[0] >= 97 and m[0] <= 122):
                            if m != self.dev.bytestring:
                                v = m.decode(encoding='UTF-8')
                                for key, value in ALIAS_TO_EVENT.items():
                                    v = v.replace(key, value)
                                v = v.split(',')
                                try:
                                    events = [getattr(EVENTS, n) for n in v]
                                    self.dev.close()
                                    self.dev = Device(self.devid, self.name, events, m)
                                    print('New control layout chosen.')
                                except AttributeError:
                                    print('ERROR. Invalid layout discarded.')
                        else:
                            v = self.preprocess(m, len(self.dev.events))
                            for e in range(0, len(v)):
                                self.dev.emit(self.dev.events[e], v[e])
                            self.dev.flush()

                    else:
                        pass  # ignore packets from other addresses

                except (socket.timeout, socket.error):
                    pass

                tdelta = time() - trecv

                if connection is not None and tdelta > 3:
                    print('Timeout (3 seconds), disconnected.')
                    print('  (listened {} times per second)'.format(int(irecv/tdelta)))
                    break

                sleep(self.dt)
                irecv += 1

    def close_atexit(self):
        print('Yoke: Unregistering zeroconf service...')
        self.close()

    def close(self):
        atexit.unregister(self.close_atexit)
        if self.dev is not None:
            self.dev.close()
        if self.sock is not None:
            self.sock.close()
        if self.info is not None:
            zeroconf.unregister_service(self.info)
