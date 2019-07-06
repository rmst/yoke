#!/usr/bin/env python3

from setuptools import setup
from setuptools import find_packages

import sys
from platform import system

setup(name='yoke',
      version='0.1.1',
      description='Yoke is a hackable Android gamepad for Linux (and Windows).',
      author='Simon Ramstedt',
      author_email='simonramstedt@gmail.com',
      url='https://github.com/rmst/yoke',
      download_url='',
      license='MIT',
      install_requires=[
            # 'numpy',
            'zeroconf',
            *(['python-uinput'] if system() == 'Linux' else [])
            ],
      extras_require={

      },
      scripts=['bin/yoke', 'bin/yoke-enable-uinput', 'bin/yoke-disable-uinput'],
      packages=find_packages(),
      package_data={'yoke': [
            'assets/joypad/*.css',
            'assets/joypad/*.js',
            'assets/joypad/*.html',
      ]},
      platforms=['GNU/Linux', 'Windows'],
      keywords=['gamepad', 'video games', 'gaming', 'controller', 'Android']
)
