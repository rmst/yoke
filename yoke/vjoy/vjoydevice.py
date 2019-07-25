import os
from ctypes import cdll
import platform

class VjoyException(Exception):
    pass

class VjoyConstants:
    BTN_1 = 1
    BTN_2 = 2
    BTN_3 = 3
    BTN_4 = 4
    BTN_5 = 5
    BTN_6 = 6
    BTN_7 = 7
    BTN_8 = 8

    ABS_X = 0x30
    ABS_Y = 0x31
    ABS_Z = 0x32
    ABS_RX = 0x33 # rotation
    ABS_RY = 0x34
    ABS_RZ = 0x35
    ABS_SL0 = 0x36  # slider
    ABS_SL1 = 0x37
    ABS_WHL = 0x38  # wheel
    ABS_POV = 0x39

class VjoyDevice:
    def __init__(self, id=None):
        self.id = id
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
        return self.lib.SetBtn(on, self.id, id)

    def set_axis(self, id, v):
        return self.lib.SetAxis(v, self.id, id)

    def close(self):
        return self.lib.RelinquishVJD(self.id)
