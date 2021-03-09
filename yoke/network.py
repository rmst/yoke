from zeroconf import ServiceBrowser, Zeroconf, InterfaceChoice, ServiceInfo
import socket

zeroconf = Zeroconf()

# Webserver to serve files to android client
from http.server import HTTPServer, SimpleHTTPRequestHandler
import socketserver
import os, urllib, posixpath
import json

# TODO: These three lines allow using the syntax with socketserver with
# old versions of Python like in the now obsolete Debian 9 (Stretch).
# Please delete once socketserver.py is updated in every major Linux distro.

if not "__enter__" in dir(socketserver.BaseServer):
    socketserver.BaseServer.__enter__ = lambda self: self
    socketserver.BaseServer.__exit__ = lambda self, *args: self.server_close()

class HTTPRequestHandler(SimpleHTTPRequestHandler):
    basepath = os.getcwd()

    def translate_path(self, path):
        """Translate a /-separated PATH to the local filename syntax."""
        # abandon query parameters
        path = path.split('?',1)[0]
        path = path.split('#',1)[0]
        # Don't forget explicit trailing slash when normalizing. Issue17324
        trailing_slash = path.rstrip().endswith('/')
        try:
            path = urllib.parse.unquote(path, errors='surrogatepass')
        except UnicodeDecodeError:
            path = urllib.parse.unquote(path)
        path = posixpath.normpath(path)
        words = path.split('/')
        words = filter(None, words)
        path = self.basepath
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                # Ignore components that are not a simple file/directory name
                continue
            path = os.path.join(path, word)
        if trailing_slash:
            path += '/'
        return path

def walk_failed(e):
    raise

def check_webserver(path):
    print('Checking files on webserver… ', end='')
    manifestContents = {
        'folders': [], 'files': [],
        'size': 0,
        'mtime': 0,
    }
    for root, dirs, files in os.walk(path, onerror=walk_failed):
        # If the folder separator is not a forward slash, convert it to a forward slash anyways.
        # It's what Android expects.
        if root != path:
            manifestContents['folders'].append(os.path.relpath(root, start=path).replace(os.sep, '/'))
        for entry in files:
            if entry != 'manifest.json':
                entrypath = os.path.join(root, entry)
                entrystat = os.stat(entrypath)
                manifestContents['files'].append(os.path.relpath(entrypath, start=path).replace(os.sep, '/'))
                manifestContents['size'] += entrystat.st_size
                manifestContents['mtime'] = max(manifestContents['mtime'], entrystat.st_mtime)
    print('OK.')
    try:
        print('Writing manifest… ', end='')
        with open(os.path.join(path, 'manifest.json'), 'w') as manifest:
            json.dump(manifestContents, manifest)
            print('OK.')
    except IOError:
        print('failed.\nYoke could not write a new `manifest.json` file to the webserver.\n'
            'You may play with an outdated file, but layouts downloaded from this server may be broken.')

def run_webserver(port, path):
    print('Starting webserver on ', port, path)
    class RH(HTTPRequestHandler):
        basepath = path
    try:
        with socketserver.TCPServer(('', port), RH) as httpd:
            httpd.serve_forever()
    except OSError:
        exit()

DEFAULT_CLIENT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'yoke', 'assets', 'joypad')

def get_ip_address():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    ip = s.getsockname()[0]
    s.close()
    return ip
