const Util = imports.misc.util;
const GTop = imports.gi.GTop;
const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const FactoryModule = Me.imports.factory;
const Promise = Me.imports.helpers.promise.Promise;

let Process = new Lang.Class({
    Name: "Process",

    _init: function(id) {
        this._id = id;
    },

    kill: function() {
        Util.spawn([ 'bash', '-c', 'kill -s TERM ' + parseInt(this._id) ]);
    }
});

let Processes = new Lang.Class({
    Name: "Processes",

    /**
     * Get ID list of running processes
     *
     * Update process list asynchronously and return the result of the last update.
     * @return Promise
     */
    getIds: function() {
        if (Processes.status === 'idle') {
            Processes.status = 'pending';
            Mainloop.idle_add(Lang.bind(this, this._updateProcessIds));
        }

        return Processes.ids;
    },

    /**
     * Get the top processes from the statistics
     *
     * @param array process_stats Items must have "pid" attributes and a value attribute for comarison.
     * @param string attribute Name of the attribute to compare.
     * @param integer limit Limit results to the first N items.
     * @return array Items have "pid" and "command" attributes.
     */
    getTopProcesses: function(process_stats, attribute, limit) {
        process_stats.sort(function(a, b) {
            return (a[attribute] > b[attribute]) ? -1 : (a[attribute] < b[attribute] ? 1 : 0);
        });

        process_stats = process_stats.slice(0, limit);

        let process_args = new GTop.glibtop_proc_args();
        let result = [];
        for (let i = 0; i < process_stats.length; i++) {
            let pid = process_stats[i].pid;
            let args = GTop.glibtop_get_proc_args(process_args, pid, 0);
            result.push({"command": args, "pid": pid});
        }
        return result;
    },

    _updateProcessIds: function() {
        let file = FactoryModule.AbstractFactory.create('file', this, '/proc');
        Processes.ids = file.list().then(files => {
            let ids = [];
            for (let i in files) {
                let id = parseInt(files[i]);
                if (!isNaN(id)) {
                    ids.push(id);
                }
            }
            Processes.status = 'idle';
            return ids;
        }, () => {
            Processes.status = 'idle';
        });

        return false;
    }
});

Processes.ids = new Promise(resolve => {
    resolve([]);
});
Processes.status = 'idle';

let Directories = new Lang.Class({
    Name: "Directories",

    /**
     * Get the list of directories using the most space.
     *
     * @param array directory_stats List of directory data.
     * @param string attribute Name of the attribute to comapre.
     * @param integer limit Limit results of the first N items.
     * @return array Items from directory_stats parameter.
     */
    getTopDirectories: function(directory_stats, attribute, limit) {
        directory_stats.sort(function(a, b) {
            return (a[attribute] < b[attribute]) ? 1 : (a[attribute] > b[attribute] ? -1 : 0);
        });

        directory_stats = directory_stats.splice(0, limit);

        return directory_stats;
    },

    /**
     * Format the input bytes to the closet possible size unit.
     *
     * @param int bytes Bytes to format
     * @param int decimals Number of decimals to display. Defaults is 2.
     * @return string
     */
    formatBytes: function(bytes, decimals) {
        if (bytes == 0) {
            return '0 Byte';
        }
        let kilo = 1000;
        let expected_decimals = decimals || 2;
        let sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        let i = Math.floor(Math.log(bytes) / Math.log(kilo));
        return parseFloat((bytes / Math.pow(kilo, i)).toFixed(expected_decimals)) + ' ' + sizes[i];
    }
});

let Swap = new Lang.Class({
    Name: "Swap",

    _init: function(id) {
        this._statistics = {};
        this._processes = new Processes;
    },

    /**
     * Get swap usage information per process
     *
     * Update data asynchronously and return the result of the last update.
     * @return Promise Keys are process IDs, values are objects like {number_of_pages_swapped: 1234}
     */
    getStatisticsPerProcess: function() {
        return this._processes.getIds().then(process_ids => {
            // Remove data of non existent processes.
            for (let pid in this._statistics) {
                if (!process_ids[pid]) {
                    delete this._statistics[pid];
                }
            }

            // Update data of processes.
            for (let i = 0; i < process_ids.length; i++) {
                Mainloop.idle_add(Lang.bind(this, this._getRawStastisticsForProcess), process_ids[i]);
            }
            return this._statistics;
        });
    },

    _getRawStastisticsForProcess: function(pid) {
        let promise = FactoryModule.AbstractFactory.create('file', this, '/proc/' + pid + '/stat').read().then(contents => {
            let number_of_pages_swapped = parseInt(contents.split(' ')[35]);
            this._statistics[pid] = {
                number_of_pages_swapped: number_of_pages_swapped
            };
        });

        return false;
    }
});
