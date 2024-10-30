import sys
import os
import re
import json
from datetime import date

configArgsList = [
    [ 'name',               "name",       "Steam Tools (Temp)", True ],
    [ 'namespace',          "namespace"   ],
    [ 'copyright',          "copyright"   ],
    [ 'version',            "version",    str(date.today()) ],
    [ 'description',        "description" ],
    [ 'author',             "author"      ],
    [ 'match',              "match"       ],
    [ 'exclude',            "exclude"     ],
    [ 'icon',               "icon"        ],
    [ 'requiredResources',  "require"     ],
    [ 'allowedConnections', "connnect"    ],
    [ 'grantPermissions',   "grant"       ],
    [ 'homepage',           "homepageURL" ],
    [ 'download',           "downloadURL" ],
    [ 'update',             "updateURL"   ],
    [ 'support',            "supportURL"  ],
    [ 'tags',               "tag"         ]
]

def get_meta_data_tuples(config, key, keyname, default_val = None, is_required = False):
    val = config.get(key)
    if val is not None:
        if type(config[key]) is list:
            for config_str in config[key]:
                return [ (keyname, config_str) for config_str in config[key] ]
        elif type(config[key]) is str:
            return [ (keyname, config[key]) ]
        else:
            raise TypeError(f"Config {key} is not a string nor list!")
    elif default_val is not None:
        return [ (keyname, default_val) ]
    elif is_required:
        raise TypeError(f"Config {key} is required, but not provided!")

    return []


def toCamelCase(str):
    camelStr = re.sub(r'(\s|\u180B|\u200B|\u200C|\u200D|\u2060|\uFEFF|\-|\_)+', ' ', str)
    camelStr = ''.join( (c.upper() if camelStr[i-1] == ' ' else c) for i, c in enumerate(camelStr) )
    camelStr = camelStr.replace(' ', '')
    camelStr = camelStr[0].lower() + camelStr[1:] if len(camelStr) != 0 else camelStr
    return camelStr


# Load config file
with open('config.json', 'r', encoding="utf-8") as config_file:
    config = json.load(config_file)


# Set output script name and open write stream
o_file_name = 'script.user.js'
if len(sys.argv) > 1 and sys.argv[1] == 'test':
    o_file_name = 'testscript.js'

o_file = open(o_file_name, 'w', encoding="utf-8")


# Grab global function priority from config is exists
# NOTE: Only modules listed in global priorities will be added to the script
config_global_priorities = config.get('globalPriorities') or {}
global_dir_entries = os.listdir('global')
global_dir_entries = list( filter(lambda x: x.endswith('.js'), global_dir_entries) )
global_dir_entries = [ x.split('.')[0] for x in global_dir_entries if x.split('.')[0] in config_global_priorities ]
global_dir_entries.sort(key=lambda x: config_global_priorities[x.split('.')[0]])


# Add userscript metadata
meta_data = []
config_metadata = config.get('metadata') or {}
for configArgs in configArgsList:
    meta_data.extend( get_meta_data_tuples(config_metadata, *configArgs) )

max_str_len = len( max(meta_data, key = lambda t: len(t[0]))[0] )

o_file.write("// ==UserScript==")
for entry in meta_data:
    o_file.write(f"\n// @{entry[0].ljust(max_str_len)}  {entry[1]}")
o_file.write("\n// ==/UserScript==\n")


# Add header comments
for comment in config.get('metadata', {}).get('comments') or []:
    o_file.write(f'\n// {comment}' if len(comment)>0 else '\n')
o_file.write('\n' * 5)


# Append global functions
for dir_entry in filter(lambda x: config_global_priorities[x] <= 0, global_dir_entries):
    print(dir_entry+'.js')
    with open(f'global/{dir_entry}.js', 'r', encoding="utf-8") as js_module:
        for line in js_module:
            o_file.write(line)
        o_file.write('\n' * 5)


# Append user modules
for dir_entry in os.scandir('modules'):
    print(dir_entry.name)

    with open(dir_entry.path, 'r', encoding="utf-8") as js_module:
        for line in js_module:
            if not re.match(r'^\w*\/\/', line):
                o_file.write(line)
        o_file.write('\n' * 5)


# Append the rest of global functions
for dir_entry in filter(lambda x: config_global_priorities[x] > 0, global_dir_entries):
    print(dir_entry+'.js')
    with open(f'global/{dir_entry}.js', 'r', encoding="utf-8") as js_module:
        for line in js_module:
            o_file.write(line)
        o_file.write('\n' * 5)


# Append css rules
for dir_entry in os.scandir('css'):
    print(dir_entry.name)

    with open(dir_entry.path, 'r', encoding="utf-8") as css_file:
        o_file.write(f'\n const {toCamelCase('css ' + dir_entry.name[:-4])} = `')
        for line in css_file:
            o_file.write(line)
        o_file.write('`;')
        o_file.write('\n')
