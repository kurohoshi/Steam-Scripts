import sys
import os
import re
import json

o_file_name = 'script.user.js'
if len(sys.argv) > 1:
    if sys.argv[1]=='test':
        o_file_name = 'testscript.js'

o_file = open(o_file_name, 'w', encoding="utf-8")

with open('global/config.json', 'r', encoding="utf-8") as config_file:
    config = json.load(config_file)

print(config)
global_dir_entries = os.listdir('global')

global_dir_entries = list(filter(lambda x: x.endswith('.js'), global_dir_entries))
global_dir_entries = [x.split('.')[0] for x in global_dir_entries if x.split('.')[0] in config]
global_dir_entries.sort(key=lambda x: config[x.split('.')[0]])

# Append global functions
for dir_entry in filter(lambda x: config[x]<=0, global_dir_entries):
    print(dir_entry+'.js')
    with open(f'global/{dir_entry}.js', 'r', encoding="utf-8") as js_module:
        for line in js_module:
            o_file.write(line)
        o_file.write('\n')

# Append user modules
for dir_entry in os.scandir('modules'):
    print(dir_entry.name)

    with open(dir_entry.path, 'r', encoding="utf-8") as js_module:
        for line in js_module:
            if not re.match(r'^\w*\/\/', line):
                o_file.write(line)
        o_file.write('\n')

# Append the rest of global functions
for dir_entry in filter(lambda x: config[x]>0, global_dir_entries):
    print(dir_entry+'.js')
    with open(f'global/{dir_entry}.js', 'r', encoding="utf-8") as js_module:
        for line in js_module:
            o_file.write(line)
        o_file.write('\n')

# Append css rules
for dir_entry in os.scandir('css'):
    print(dir_entry.name)

    with open(dir_entry.path, 'r', encoding="utf-8") as css_file:
        o_file.write(f'\n const css{dir_entry.name[:-4].capitalize()} = `')
        for line in css_file:
            o_file.write(line)
        o_file.write('`;')
        o_file.write('\n')
