from time import sleep, time
from platform import system
import atexit
import sys
from yoke import events as EVENTS
from yoke.network import *
import struct
from glob import glob
from threading import Thread
if system() == 'Windows':
    from yoke.vjoy.vjoydevice import VjoyDevice
elif system() == 'Linux':
    import uinput

ABS_EVENTS = [getattr(EVENTS, n) for n in dir(EVENTS) if n.startswith('ABS_')]

# Basic error handlers used (and explained) by the script bin/yoke:
class TCPPortError(RuntimeError):
    pass
class DeviceNameTakenError(RuntimeError):
    pass
class UInputDisabledError(Exception):
    pass

class Device:
    def __init__(self, id=1, name='Yoke', events=(), bytestring=b'!impossible?aliases#string$'):
        self.name = name + '-' + str(id)
        for fn in glob('/sys/class/input/js*/device/name'):
            with open(fn) as f:
                fname = f.read().split()[0]  # need to split because there seem to be newlines
                if name == fname:
                    raise DeviceNameTakenError(name)

        # set range (0, 0x7fff) for abs events
        self.events = events
        self.bytestring = bytestring
        self.inStruct = struct.Struct('>x' + ''.join(['H' if e in ABS_EVENTS else '?' for e in events]))
        events = [e + (0, 0x7fff, 0, 0) if e in ABS_EVENTS else e for e in events]

        BUS_VIRTUAL = 0x06
        try:
            self.device = uinput.Device(events, name, BUS_VIRTUAL)
        except Exception as e:
            raise UInputDisabledError(*e.args)

    def emit(self, d, v):
        if d not in self.events:
            print('Event {d} has not been registered… yet?'.format(d))
        self.device.emit(d, int(v), False)

    def flush(self):
        self.device.syn()

    def close(self):
        self.device.destroy()


# Override on Windows
if system() == 'Windows':
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
        self.thread = Thread(target=run_webserver, args=(self.port, self.client_path), daemon=True)
        self.thread.start()

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

        if not self.thread.is_alive():
            raise TCPPortError

        while True:
            trecv = time()
            irecv = 0
            connection = None
            print('\nTo connect select "{}" on your device,'.format(netname))
            print('or connect manually to "{}:{}"'.format(adr, port))
            print('Press Ctrl+C to exit.')

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
                            if (self.status_length != self.dev.inStruct.size):
                                self.status_length = self.dev.inStruct.size
                                # This should not help, but for some reason, it does on Windows:
                                if system() == 'Windows':
                                    self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, self.status_length)
                            v = self.preprocess(m)
                            for ev, val in zip(self.dev.events, v):
                                self.dev.emit(ev, val)
                            self.dev.flush()
                        # Else, it is information for a layout.
                        # If this is different than the current one, replace device.
                        else:
                            if len(m) >= self.status_length:
                                # Oops, the message didn't fit in.
                                # Do nothing yet, but restore expected length to its original value:
                                self.status_length = self.bufsize
                                self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, self.status_length)
                            elif m != self.dev.bytestring:
                                v = m.decode(encoding='UTF-8')
                                for key, value in EVENTS.ALIAS.items():
                                    v = v.replace(key, value)
                                v = v.split(',')
                                try:
                                    events = [getattr(EVENTS, n) for n in v]
                                    self.dev.close()
                                    self.dev = Device(self.devid, self.name, events, m)
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
                    self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, self.status_length)
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
