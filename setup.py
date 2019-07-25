#!/usr/bin/env python3

from setuptools import setup, find_packages
import platform
from setuptools.command.install import install # https://stackoverflow.com/questions/20288711/

# https://github.com/shauleiz/vJoy de windows 7 a windows 10 1803 (10.0.17134)
# https://sourceforge.net/projects/vjoystick/files/Beta%202.x/2.1.8.39-270518/vJoySetup.exe/download
# https://github.com/jshafer817/vJoy en adelante
# https://sourceforge.net/projects/vjoystick/files/latest/download

yoke_package_data = [
    'assets/joypad/*',
    'assets/joypad/img/*'
]

if platform.system() == 'Windows':
    import ctypes # https://stackoverflow.com/questions/2963263/
    if not (platform.release() in ('Vista', '7', '8', '8.1', 'post8.1', '10', 'post10')):
        raise SystemError('Yoke depends on the vJoy driver, which needs Windows Vista SP1 or higher.')
    elif platform.release() in ('Vista', '7', '8', '8.1', 'post8.1') or [int(v) for v in platform.version().split('.')[0:3]] <= [10, 0, 1803]:
        DLL_path = 'vjoy/vJoyInterface-' + platform.architecture()[0] + '-legacy.dll'
    else:
        DLL_path = 'vjoy/vJoyInterface-' + platform.architecture()[0] + '-modern.dll'
elif platform.system() == 'Android':
    raise SystemError('This program is supposed to be installed on an external computer. '
        'For Android, you can download the APK at '
        'https://f-droid.org/en/packages/com.simonramstedt.yoke/')
elif platform.system() != 'Linux':
    raise SystemError('Yoke is not yet compatible with ' + platform.system() + '. '
        'Please contact the author if you know any virtual joystick driver for your system.')

yoke_package_data.append(DLL_path)

DLL_path = None
vJoy_url = None

class PostInstallCommand(install):
    def run(self):
        if platform.system() == 'Windows':
            if platform.release() in ('Vista', '7', '8', '8.1', 'post8.1') or [int(v) for v in platform.version().split('.')[0:3]] <= [10, 0, 1803]:
                vJoy_url = 'https://sourceforge.net/projects/vjoystick/files/Beta%202.x/2.1.8.39-270518/vJoySetup.exe/download'
            else:
                vJoy_url = 'https://sourceforge.net/projects/vjoystick/files/latest/download'
            print('You should now see a prompt to download the vJoy driver.\n'
                'If you need to install this driver, you can do so anytime by visiting ' + vJoy_url)
            answer = ctypes.windll.user32.MessageBoxW(0, 'Yoke was installed succesfully, but can only work if the correct vJoy driver is installed. '
                'The driver for Windows ' + platform.release() + ', version ' + platform.version() + ' at:\n\n' + vJoy_url + '\n\n'
                'Click OK if you want to download the installer now, or Cancel otherwise.', 'vJoy driver required', 33) # 33 = question icon, OK and Cancel buttons
            if answer == 1: # 1 is OK, 2 is cancel or close.
                import webbrowser
                webbrowser.open_new(vJoy_url)
        install.run(self)

setup(
    name='yoke',
    version='0.1.1',
    description='A hackable Android gamepad for Linux (and Windows).',
    author='Simon Ramstedt',
    author_email='simonramstedt@gmail.com',
    url='https://github.com/rmst/yoke',
    download_url='',
    license='MIT License',
    dependency_links=[],
    install_requires=[
        'zeroconf',
        'python-uinput; platform_system == "Linux"',
    ],
    extras_require={},
    scripts=['bin/yoke', 'bin/yoke-enable-uinput', 'bin/yoke-disable-uinput'],
    cmdclass={
        'install': PostInstallCommand,
    },
    packages=find_packages(),
    package_data={'yoke': yoke_package_data},
    platforms=['Linux', 'Windows 7', 'Windows 8', 'Windows 10'],
    keywords=['gamepad', 'video games', 'gaming', 'controller', 'Android'],
    classifiers=[
        'Topic :: Games/Entertainment',
        'Development Status :: 3 - Alpha',
    ]
)
