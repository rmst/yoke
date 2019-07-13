## Yoke (desktop client)

![Accelerometer](media/flightgear.gif)

#### Yoke is a hackable Android gamepad for Linux (and Windows)

Get the Android app on [F-Droid](https://f-droid.org/packages/com.simonramstedt.yoke/), [Google Play](https://play.google.com/store/apps/details?id=com.simonramstedt.yoke) or [Github](https://github.com/rmst/yoke-android).

The Linux client can be installed with
```bash
# Requires Python 3.5+ which comes pre-installed in Ubuntu 16.04 and after.
git clone --branch v0.1 --depth 1 https://github.com/rmst/yoke
cd yoke
# Now tweak files in e.g. yoke/assets/joypad
pip3 install .
# Note: you can use pip3 install --user to install to home dir.
# Note: you can use pip3 install -e to make pip create symlinks instead of copying files
# so you won't have to rerun pip after changes
```
On Linux to enable Yoke to create gamepad devices we need to add a udev rule
```bash
yoke-enable-uinput  # you can find that script in the "bin" directory
```
(This can be undone via `yoke-disable-uinput`)

On Windows Yoke needs the vJoy driver. The installer can be downloaded [here](https://sourceforge.net/projects/vjoystick/).

Now you can run the client with
```bash
yoke
```
Your computer should then show up in the Yoke app immediately if you are on the same network.

### Extras
To test Yoke on Linux you can install, e.g. jstest-gtk:
```bash
sudo apt install jstest-gtk
jstest-gtk  # to run
```

To use Yoke effectively with SDL-based games (e.g. all games using Unreal Engine or Unity3D), you can install the SDL gamepad tool. (If the package is not found, [download the tool from the website](http://generalarcade.com/gamepadtool/).)
```bash
sudo apt install gamepadtool
gamepadtool   # to run
```

### Multiple virtual devices on the same machine
Each `yoke` process creates one virtual device. To run multiple processes on the same machine make sure to give them different `--id` numbers (any integer greater than 0).

### Security
The communication between the Linux client and the Android app are unencrypted UDP messages. You should therefore use it in networks you trust. However, if you are not in a trusted environment you can always create one via USB or Bluetooth. Just enable USB or Bluetooth tethering on your Android device and connect your Linux computer. This will create a mini-network for just your Phone and Computer and Yoke will work as usual.

### Tweaking
Many aspects of Yoke behavior can be changed easily - ave a look at `yoke/assets/joypad`, `bin/yoke` and `yoke/service.py`.

![Thumbstick](media/thumbstick.gif)
