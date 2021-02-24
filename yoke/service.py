from zeroconf import ServiceBrowser, Zeroconf, InterfaceChoice, ServiceInfo
import socket

from time import sleep, time
from platform import system
import atexit
import sys

from yoke import events as EVENTS
import struct

ALIAS_TO_EVENT = {
    'j1':  'ABS_X,ABS_Y',
    'j2':  'ABS_RX,ABS_RY',
    'j3':  'ABS_TOOL_WIDTH,ABS_MAX',
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
    'dp':  'BTN_DPAD_UP,BTN_DPAD_LEFT,BTN_DPAD_DOWN,BTN_DPAD_RIGHT',
}

def get_ip_address():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    ip = s.getsockname()[0]
    s.close()
    return ip

from glob import glob


ABS_EVENTS = [getattr(EVENTS, n) for n in dir(EVENTS) if n.startswith('ABS_')]
preliminary_error = None

class Device:
    def __init__(self, id=1, name='Yoke', events=(), bytestring=b'!impossible?aliases#string$'):
        self.name = name + '-' + str(id)
        for fn in glob('/sys/class/input/js*/device/name'):
            with open(fn) as f:
                fname = f.read().split()[0]  # need to split because there seem to be newlines
                if name == fname:
                    raise AttributeError('Device name "{}" already taken. Set another name with --name NAME'.format(name))

        # set range (0, 0x7fff) for abs events
        self.events = events
        self.bytestring = bytestring
        self.inStruct = struct.Struct('>x' + ''.join(['H' if e in ABS_EVENTS else '?' for e in events]))
        events = [e + (0, 0x7fff, 0, 0) if e in ABS_EVENTS else e for e in events]

        BUS_VIRTUAL = 0x06
        try:
            import uinput
            self.device = uinput.Device(events, name, BUS_VIRTUAL)
        except Exception as e:
            print("Failed to initialize device via uinput.")
            print("Hint: try loading kernel driver with `sudo modprobe uinput`.")
            print("Hint: make sure you've run `yoke-enable-uinput` to configure permissions.")
            print("")
            print("More info: {}".format(e.args))
            raise

    def emit(self, d, v):
        if d not in self.events:
            print('Event {d} has not been registered… yet?')
        self.device.emit(d, int(v), False)

    def flush(self):
        self.device.syn()

    def close(self):
        self.device.destroy()


# Override on Windows
if system() is 'Windows':
    print('Warning: This is not well tested on Windows!')

    from yoke.vjoy.vjoydevice import VjoyDevice

    class Device:
        def __init__(self, id=1, name='Yoke', events=(), bytestring=b'!impossible?aliases#string$'):
            super().__init__()
            self.name = name + '-' + str(id)
            self.device = VjoyDevice(id)
            self.lib = self.device.lib
            self.id = self.device.id
            self.inStruct = '>x'
            self.outStruct = self.device.outStruct
            self.events = []
            self.bytestring = bytestring
            #a vJoy controller has up to 8 axis with fixed names, and 128 buttons with no names.
            #TODO: Improve mapping between uinput events and vJoy controls.
            axes = 0
            buttons = 0
            for event in events:
                if event[0] == 0x01: # button/key
                    self.events.append((event[0], buttons)); buttons += 1
                    self.inStruct += '?'
                elif event[0] == 0x03: # analog axis
                    self.events.append((event[0], axes)); axes += 1
                    self.inStruct += 'H'
            self.inStruct = struct.Struct(self.inStruct)
            self.axes = [0,] * 15
            self.buttons = 0
        def emit(self, d, v):
            if d is not None:
                if d[0] == 0x03: #analog axis
                    # To map from [0x0, 0x7fff] to [0x1, 0x8000], just sum 1.
                    self.axes[d[1]] = v + 1
                else:
                    self.buttons |= (v << d[1])
        def flush(self):
            # Struct JOYSTICK_POSITION_V2's definition can be found at
            # https://github.com/shauleiz/vJoy/blob/2c9a6f14967083d29f5a294b8f5ac65d3d42ac87/SDK/inc/public.h#L203
            # It's basically:
            # 1 BYTE for device ID
            # 3 unused LONGs
            # 8 LONGs for axes
            # 7 unused LONGs
            # 1 LONGs for buttons
            # 4 DWORDs for hats
            # 3 LONGs for buttons
            self.lib.UpdateVJD(self.id, self.outStruct.pack(
                self.id, # 1 BYTE for device ID
                0, 0, 0, # 3 unused LONGs
                *self.axes, # 8 LONGs for axes and 7 unused LONGs
                self.buttons & 0xffffffff, # 1 LONG for buttons
                0, 0, 0, 0, # 4 DWORDs for hats
                (self.buttons >> 32) & 0xffffffff,
                (self.buttons >> 64) & 0xffffffff,
                (self.buttons >> 96) & 0xffffffff # 3 LONGs for buttons
            ))

            # This allows a very simple emit() definition:
            self.buttons = 0
        def close(self):
            self.device.close()


zeroconf = Zeroconf()


# Webserver to serve files to android client
from http.server import HTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import socketserver
import os, urllib, posixpath
import json

# TODO: These three lines allow using the syntax with socketserver with
# old versions of Python like in the now obsolete Debian 9 (Stretch).
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

def walk_failed(e):
    raise

def check_webserver(path):
    print('Checking files on webserver… ', end='')
    manifestContents = {
        'folders': [], 'files': [],
        'size': 0,
        'mtime': 0,
    }
    for root, dirs, files in os.walk(path, onerror=walk_failed):
        # If the folder separator is not a forward slash, convert it to a forward slash anyways.
        # It's what Android expects.
        if root != path:
            manifestContents['folders'].append(os.path.relpath(root, start=path).replace(os.sep, '/'))
        for entry in files:
            if entry != 'manifest.json':
                entrypath = os.path.join(root, entry)
                entrystat = os.stat(entrypath)
                manifestContents['files'].append(os.path.relpath(entrypath, start=path).replace(os.sep, '/'))
                manifestContents['size'] += entrystat.st_size
                manifestContents['mtime'] = max(manifestContents['mtime'], entrystat.st_mtime)
    print('OK.')
    try:
        print('Writing manifest… ', end='')
        with open(os.path.join(path, 'manifest.json'), 'w') as manifest:
            json.dump(manifestContents, manifest)
            print('OK.')
    except IOError:
        print('failed.\nYoke could not write a `manifest.json` file to the webserver.\n'
            'You may play without this file, but layouts downloaded from this server may be broken.')

def run_webserver(port, path):
    print('Starting webserver on ', port, path)
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
    dt = 0.020
    tdelta_max = 2

    def __init__(self, devname='Yoke', devid='1', iface='auto', port=0, bufsize=64, client_path=DEFAULT_CLIENT_PATH):
        self.dev = Device(devid, devname)
        self.name = devname
        self.devid = devid
        self.iface = iface
        self.port = port
        self.bufsize = bufsize
        self.client_path = client_path
        self.status_length = bufsize

    def preprocess(self, message):
        v = self.dev.inStruct.unpack(message)
        return v

    def run(self):
        atexit.register(self.close_atexit)

        if self.iface == 'auto':
            self.iface = get_ip_address()

        # open udp socket on random available port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, self.bufsize)  # small buffer for low latency
        self.sock.bind((self.iface, self.port))
        self.sock.settimeout(0)
        adr, port = self.sock.getsockname()
        self.port = port

        check_webserver(self.client_path)
        Thread(target=run_webserver, args=(self.port, self.client_path), daemon=True).start()

        # create zeroconf service
        stype = '_yoke._udp.local.'
        netname = socket.gethostname() + '-' + self.dev.name
        fullname = netname + '.' + stype
        self.info = ServiceInfo(
            stype,
            fullname,
            addresses=[socket.inet_aton(adr)],
            port=port,
            properties={},
            server=fullname
        )
        zeroconf.register_service(self.info, ttl=10)

        while True:
            print('\nTo connect select "{}" on your device,'.format(netname))
            print('or connect manually to "{}:{}"'.format(adr, port))
            print('Press Ctrl+C to exit.')
            trecv = time()
            irecv = 0
            connection = None

            while True:
                try:
                    m, address = self.sock.recvfrom(self.status_length)

                    if connection is None:
                        print('Connected to ', address)
                        connection = address

                    if connection == address:
                        trecv = time()
                        irecv = 0
                        # If the message starts with a null byte, it is a status report from the game controller.
                        if (m[0] == 0):
                            v = self.preprocess(m)
                            for e in range(0, len(v)):
                                self.dev.emit(self.dev.events[e], v[e])
                            self.dev.flush()
                        # Else, it is information for a layout.
                        # If this is different than the current one, replace device.
                        else:
                            if len(m) >= self.status_length:
                                # Oops, the message didn't fit in.
                                # Do nothing yet, but restore expected length to its original value:
                                self.status_length = self.bufsize
                            elif m != self.dev.bytestring:
                                v = m.decode(encoding='UTF-8')
                                for key, value in ALIAS_TO_EVENT.items():
                                    v = v.replace(key, value)
                                v = v.split(',')
                                try:
                                    events = [getattr(EVENTS, n) for n in v]
                                    self.dev.close()
                                    self.dev = Device(self.devid, self.name, events, m)
                                    self.status_length = self.dev.inStruct.size
                                    print('New control layout chosen.')
                                except AttributeError:
                                    print('Error. Invalid layout discarded.')

                    else:
                        pass  # ignore packets from other addresses

                except (socket.timeout, socket.error):
                    pass

                tdelta = time() - trecv

                if connection is not None and tdelta > self.tdelta_max:
                    print('Timeout ({} seconds), disconnected.'.format(self.tdelta_max))
                    print('  (listened {} times per second)'.format(int(irecv/tdelta)))
                    self.status_length = self.bufsize
                    break

                sleep(self.dt)
                irecv += 1

    def close_atexit(self):
        print('Yoke: Unregistering zeroconf service…')
        self.close()

    def close(self):
        atexit.unregister(self.close_atexit)
        if self.dev is not None:
            self.dev.close()
        if self.sock is not None:
            self.sock.close()
        if self.info is not None:
            zeroconf.unregister_service(self.info)
