import os
from ctypes import cdll
import platform
import struct

class VjoyException(Exception):
    pass

class VjoyDevice:
    def __init__(self, id=None):
        self.id = id
        self.axes = [0,] * 15
        self.buttons = 0
        self.struct = struct.Struct('@B 18L L 4I 3L')
        if platform.release() in ('10', 'post10') and [int(v) for v in platform.version().split('.')[0:3]] > [10, 0, 1803]:
            lib_name = "vJoyInterface-" + platform.architecture()[0] + "-modern.dll"
        else:
            lib_name = "vJoyInterface-" + platform.architecture()[0] + "-legacy.dll"
        lib_path = os.path.join(os.path.dirname(__file__), lib_name)
        try:
            self.lib = cdll.LoadLibrary(lib_path)
        except OSError as err:
            if err.winerror == 126:
                print("ERROR: " + lib_name + " could not be found. Please reinstall Yoke.\n"
                    "Exiting now.")
                exit(err.winerror)
            elif err.winerror == 193:
                print("ERROR: The DLL found does not match your vJoy driver, OS and/or Python machine. Please reinstall Yoke.\n"
                    "Exiting now.")
                exit(err.winerror)
            else:
                raise
        except:
            raise

        self.lib.vJoyEnabled()
        self.lib.AcquireVJD(id)

    def set_button(self, id, on):
        self.buttons |= (on << id)
    def set_axis(self, id, v):
        self.axes[id] = ((v << 7) | (v >> 1)) + 1
    def flush(self, axes, buttons):
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
            self.lib.UpdateVJD(self.id, self.struct.pack(
                self.id, # 1 BYTE for device ID
                0, 0, 0, # 3 unused LONGs
                *axes, # 8 LONGs for axes and 7 unused LONGs
                buttons & 0xffffffff, # 1 LONG for buttons
                0, 0, 0, 0, # 4 DWORDs for hats
                (buttons >> 32) & 0xffffffff,
                (buttons >> 64) & 0xffffffff,
                (buttons >> 96) & 0xffffffff # 3 LONGs for buttons
            ))
    def close(self):
        return self.lib.RelinquishVJD(self.id)
