## Yoke
#### Yoke is a hackable Android gamepad for Linux

Get the [Android app here](https://play.google.com/store/apps/details?id=com.simonramstedt.yoke).

The Linux client can be installed from this repo via
```
pip3 install git+https://github.com/rmst/yoke.git  # requires Python 3.5+
```
To enable Yoke to create gamepad devices we need to add a udev rule
```
sudo yoke-enable-uinput
```
(This can be undone via `yoke-disable-uinput`)


### Extras
To test Yoke you can install, e.g. jstest-gtk:
```
sudo apt install jstest-gtk
jstest-gtk  # to run
```

Additionally to use Yoke effectively with SDL2 games (e.g. all games based on Unreal Engine and Unity3D) you can install the SDL2 gamepad tool
```
sudo apt install gamepadtool
gamepadtool   # to run
```
