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
        self.outStruct = struct.Struct('@B 18L L 4I 3L')
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

    def close(self):
        return self.lib.RelinquishVJD(self.id)
