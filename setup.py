from setuptools import setup
from setuptools import find_packages


import sys
# if sys.version_info < (3, 6):
#   sys.exit('Sorry, Python < 3.6 is not supported')


setup(name='yoke',
      version='0.1',
      description='',
      author='Simon Ramstedt',
      author_email='simonramstedt@gmail.com',
      url='',
      download_url='',
      license='MIT',
      install_requires=[
            # 'numpy',
            'zeroconf',
            'python-uinput'
            ],
      extras_require={

      },
      scripts=['bin/yoke', 'bin/yoke-enable-uinput', 'bin/yoke-disable-uinput'],
      packages=find_packages())
