
/**
 * Generates the package.json files for the plugins.
 * @link https://github.com/pubkey/rxdb/pull/4196#issuecomment-1364369523
 */

const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const assert = require('assert');

async function run() {
    const rootPackageJsonPath = path.join(__dirname, '../', 'package.json');
    const packageJson = require(rootPackageJsonPath);
    const pluginsFolderPath = path.join(__dirname, '../plugins');

    const pluginsSrcFolderPath = path.join(__dirname, '../src/plugins');

    // recreate plugins folder
    await rimraf.sync(pluginsFolderPath, {});
    await fs.promises.mkdir(pluginsFolderPath);

    // write package.json files
    const usedPluginNames = new Set();
    const plugins = packageJson.exports;
    Object.keys(plugins)
        .filter(pluginPath => pluginPath !== '.' && pluginPath !== './package.json')
        .forEach((pluginPath) => {
            console.log(pluginPath);
            const pluginName = pluginPath.split('/').pop();
            usedPluginNames.add(pluginName);

            // Ensure the configuration is correct and all plugins are defined equally
            const pluginRootConfig = plugins[pluginPath];
            assert.strictEqual(
                pluginRootConfig.types,
                './dist/types/plugins/' + pluginName + '/index.d.ts'
            );
            assert.strictEqual(
                pluginRootConfig.node,
                './dist/lib/plugins/' + pluginName + '/index.js'
            );
            assert.strictEqual(
                pluginRootConfig.require,
                './dist/lib/plugins/' + pluginName + '/index.js'
            );
            assert.strictEqual(
                pluginRootConfig.es2015,
                './dist/es/plugins/' + pluginName + '/index.js'
            );
            assert.strictEqual(
                pluginRootConfig.default,
                './dist/es/plugins/' + pluginName + '/index.js'
            );


            // write plugin package.json
            const pluginPackageContent = {
                'name': 'rxdb-plugins-' + pluginName,
                'description': 'This package.json file is generated by the "npm run build:plugins" script, do not edit it manually!',
                'main': '../../dist/lib/plugins/' + pluginName + '/index.js',
                'module': '../../dist/es/plugins/' + pluginName + '/index.js',
                'es2015': '../../dist/es/plugins/' + pluginName + '/index.js',
                'jsnext:main': '../../dist/es/plugins/' + pluginName + '/index.js',
                'types': '../../dist/types/plugins/' + pluginName + '/index.d.ts',
                'sideEffects': false
            };

            const pluginFolderPath = path.join(pluginsFolderPath, pluginName);
            fs.mkdirSync(pluginFolderPath);
            fs.writeFileSync(
                path.join(pluginFolderPath, 'package.json'),
                JSON.stringify(pluginPackageContent, null, 4),
                'utf-8'
            );
        });


    // ensure we did not forget any plugin
    const pluginsSrc = await fs.promises.readdir(pluginsSrcFolderPath);
    pluginsSrc.forEach(pluginName => {
        if (!usedPluginNames.has(pluginName)) {
            throw new Error('Plugin folders exists but is not defined in package.json: ' + pluginName);
        }
    });

}
run();
