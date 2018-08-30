## Yoke
#### Yoke is a hackable Android gamepad for Linux

Get the [Android app here](https://play.google.com/store/apps/details?id=com.simonramstedt.yoke).

The Linux client can be installed from this repo via
```bash
# Requires Python 3.5+ which comes pre-installed in Ubuntu 16.04 and after.
pip3 install git+https://github.com/rmst/yoke.git
```
To enable Yoke to create gamepad devices we need to add a udev rule
```bash
sudo yoke-enable-uinput
```
(This can be undone via `yoke-disable-uinput`)

Then you can run the client with
```bash
yoke
```
Your computer should then show up in the Yoke app immediately if you are on the same network.

### Extras
To test Yoke you can install, e.g. jstest-gtk:
```bash
sudo apt install jstest-gtk
jstest-gtk  # to run
```

To use Yoke effectively with SDL-based games (e.g. all games using Unreal Engine or Unity3D), you can install the SDL gamepad tool.
```bash
sudo apt install gamepadtool
gamepadtool   # to run
```

### Security
The communication between the Linux client and the Android app are unencrypted UDP messages. You should therefore use it in networks you trust. However, if you are not in a trusted environment you can always create one via USB or Bluetooth. Just enable USB or Bluetooth tethering on your Android device and connect your Linux computer. This will create a mini-network for just your Phone and Computer and Yoke will work as usual.

### Tweaking
Changing the controller mapping and behaviour of certain axes is very simple. Have a look at `bin/yoke` which is the simple Python script that is used for the `yoke` command.

If you want to modify more low level stuff that's also pretty easy. The Yoke linux client basically consists of single Python file `yoke/service.py`.
