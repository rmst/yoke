from zeroconf import ServiceBrowser, Zeroconf, InterfaceChoice
import ipaddress
import logging
import socket
import sys
from time import sleep
from zeroconf import ServiceInfo, Zeroconf

import time
import socket
from time import sleep, time
from platform import system
from threading import Thread, Event
import sys
import json
import argparse
import atexit

from yoke import events as EVENTS


def get_ip_address():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    ip = s.getsockname()[0]
    s.close()
    return ip
    
from glob import glob

GAMEPAD_EVENTS = (
    EVENTS.ABS_X,
    EVENTS.ABS_Y,
    EVENTS.ABS_RX,
    EVENTS.ABS_RY,
    EVENTS.ABS_HAT0X,
    EVENTS.ABS_HAT0Y,
    EVENTS.BTN_GAMEPAD,
    EVENTS.BTN_SOUTH,
    EVENTS.BTN_EAST,
    EVENTS.BTN_DPAD_DOWN,
    EVENTS.BTN_DPAD_RIGHT,
    EVENTS.BTN_DPAD_UP,
    EVENTS.BTN_DPAD_LEFT,
    EVENTS.BTN_TR,
    EVENTS.BTN_TL,
    EVENTS.BTN_START,
    EVENTS.BTN_SELECT,
    EVENTS.BTN_MODE,
    )




ABS_EVENTS = [getattr(EVENTS, n) for n in dir(EVENTS) if n.startswith("ABS_")]

class Device:
    def __init__(self, name="Yoke", events=GAMEPAD_EVENTS):
        self.name = name
        for fn in glob('/sys/class/input/js*/device/name'):
            with open(fn) as f:
                fname = f.read().split()[0]  # need to split because there seem to be newlines
                if name == fname:
                    raise AttributeError('Device name "{}" already taken. Set another name with --name NAME'.format(name))

        # set range (0, 255) for abs events
        self.events = events
        events = [e + (0, 255, 0, 0) if e in ABS_EVENTS else e for e in events]

        BUS_VIRTUAL = 0x06
        import uinput

        self.device = uinput.Device(events, name, BUS_VIRTUAL)

    def emit(self, d, v):
        if d not in self.events:
            raise AttributeError("Event {} has not been registered.".format(d))
        self.device.emit(d, int((v+1)/2 * 255), syn=False)

    def flush(self):
        self.device.syn()

    def close(self):
        self.device.destroy()


# Override on Windows
if system() is 'Windows':
    # print("Warning: This is not well tested on Windows!")

    from yoke.vjoy.vjoydevice import VjoyConstants, VjoyDevice

    # ovverride EVENTS with the correct constants
    for k in vars(EVENTS):
        setattr(EVENTS, k, getattr(VjoyConstants, k, None))

    class Device:
        def __init__(self, name, events=GAMEPAD_EVENTS):
            super().__init__()
            self.device = VjoyDevice(1)  
            self.events = events
            self.name = name
        def emit(self, d, v):
            if d is not None:
                if d in range(1, 8+1):
                    self.device.set_button(d, v)
                else:
                    self.device.set_axis(d, int((v+1)/2 * 32768))
        def flush(self):
            pass
        def close(self):
            self.device.close()


zeroconf = Zeroconf()

class Service:
    dev = None
    sock = None
    info = None
    dt = 0.02

    def __init__(self, dev, port=0):
        self.dev = dev
        self.port = port
        
    def make_events(self, values):
        """returns a (event_code, value) tuple for each value in values
        values are in (-1, 1) and should be returned in (-1, 1)
        """
        raise NotImplementedError()
    
    def preprocess(self, message):
        v = message.split()[1:]  # first value is useless at the moment
        v = [float(m) for m in v]
        v = (
                (v[0]/9.81 - 0)    * 1.5,
                (v[1]/9.81 - 0.52) * 3.0,
                v[2],
                v[3],
                v[4],
                v[5],
            )
        return v

    def run(self):
        atexit.register(self.close_atexit)

        # open udp socket on random available port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 128)  # small buffer for low latency
        self.sock.bind((get_ip_address(), self.port))
        self.sock.settimeout(0)
        adr, port = self.sock.getsockname()
        self.port = port

        # create zeroconf service
        stype = "_yoke._udp.local."
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
                        v = self.preprocess(m)
                        for e in self.make_events(v):
                            self.dev.emit(*e)
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
        print("Yoke: Unregistering zeroconf service...")
        self.close()

    def close(self):
        atexit.unregister(self.close_atexit)
        if self.dev is not None:
            self.dev.close()
        if self.sock is not None:
            self.sock.close()
        if self.info is not None:
            zeroconf.unregister_service(self.info)
