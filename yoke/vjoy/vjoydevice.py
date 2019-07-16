import os
from ctypes import cdll

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
	ABS_Y	= 0x31
	ABS_Z	= 0x32
	ABS_RX = 0x33  # rotation
	ABS_RY = 0x34
	ABS_RZ = 0x35
	ABS_SL0 = 0x36  # slider
	ABS_SL1 = 0x37
	ABS_WHL = 0x38  # wheel
	ABS_POV = 0x39

class VjoyDevice:
	def __init__(self,id=None):
		self.id=id
		lib_path = os.path.join(os.path.dirname(__file__), "vJoyInterface.dll")
		self.lib = cdll.LoadLibrary(lib_path)
		# if not self.lib.DriverMatch():
		# 	raise VjoyException('The installed version of vjoy and {} do not match'.format(lib_path))
		self.lib.vJoyEnabled()
		self.lib.AcquireVJD(id)

	def set_button(self, id, on):
		return self.lib.SetBtn(on, self.id, id)

	def set_axis(self,id, v):
		return self.lib.SetAxis(v, self.id, id)

	def close(self):
		return self.lib.RelinquishVJD(self.id)
