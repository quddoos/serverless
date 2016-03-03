'use strict';

/**
 * Action: Plugin create
 * - validates that plugin does NOT already exists
 * - validates that the plugins directory is present
 * - generates plugin skeleton with the plugins name
 *
 * Event Options:
 * - pluginName:      (String) The name of your plugin
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    fs         = require('fs'),
    SError     = require(path.join(serverlessPath, 'Error')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    _          = require('lodash'),
    execSync   = require('child_process').execSync;
  let SUtils;

  BbPromise.promisifyAll(fs);

  /**
   * PluginCreate Class
   */

  class PluginCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    static getName() {
      return 'serverless.core.' + PluginCreate.name;
    }

    registerActions() {
      this.S.addAction(this.pluginCreate.bind(this), {
        handler:       'pluginCreate',
        description:   `Creates scaffolding for a new plugin.
usage: serverless plugin create <plugin>`,
        context:       'plugin',
        contextAction: 'create',
        options:       [
          {
            option:      'skipNpm',
            shortcut:    's',
            description: 'Skip NPM linking'
          }
        ],
        parameters: [
          {
            parameter: 'name',
            description: 'The name of your plugin',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    pluginCreate(evt) {

      let _this   = this;
      _this.evt   = evt;

      return _this._prompt()
        .bind(_this)
        .then(_this._createPluginSkeleton)
        .then(function() {

          SCli.log('Successfully created plugin scaffold with the name: "'  + _this.evt.options.name + '"');

          /**
           * Return Event
           */
          _this.evt.data.name = _this.evt.options.name;
          return _this.evt;

        });
    }

    /**
     * Prompt plugin if they're missing
     */

    _prompt() {

      let _this   = this,
        overrides = {};

      // If non-interactive, skip
      if (!_this.S.config.interactive || _this.evt.options.name) return BbPromise.resolve();

      let prompts = {
        properties: {
          name: {
            description: 'Enter a new plugin name: '.yellow,
            message:     'Plugin name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     (pluginName) => {
              return SPlugin.validateName(pluginName);
            }
          }
        }
      };

      return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.evt.options.name = answers.name;
        });
    };

    /**
     * Create Plugin Skeleton
     */

    _createPluginSkeleton() {

      if (!SPlugin.validateName(this.evt.options.name)) throw new SError(`Invalid Plugin name`);
      // Name of the plugin
      let pluginName = this.evt.options.name;
      // Paths
      let projectPath = this.S.getProject().getRootPath();
      let serverlessPath = this.S.getServerlessPath();
      // Directories
      let pluginsDirectory = this.S.getProject().getRootPath('plugins');
      let pluginDirectory = path.join(pluginsDirectory, pluginName);
      let pluginTemplateDirectory = path.join(serverlessPath, 'templates', 'plugin');
      // Plugin files from the serverless template directory
      let indexJs = fs.readFileSync(path.join(pluginTemplateDirectory, 'index.js'));
      let packageJson = fs.readFileSync(path.join(pluginTemplateDirectory, 'package.json'));
      let readmeMd = fs.readFileSync(path.join(pluginTemplateDirectory, 'README.md'));

      // Create the plugins directory if it's not yet present
      if (!SUtils.dirExistsSync(pluginsDirectory)) {
        fs.mkdirSync(pluginsDirectory);
      }

      // Create the directory for the new plugin in the plugins directory
      if (!SUtils.dirExistsSync(pluginDirectory)) {
        fs.mkdirSync(pluginDirectory);
      } else {
        throw new SError('Plugin with the name ' + pluginName + ' already exists.');
      }

      // Prepare and copy all files
      let modifiedPackageJson = _.template(packageJson)({ pluginName: pluginName });
      fs.writeFileSync(path.join(pluginDirectory, 'package.json'), modifiedPackageJson);
      fs.writeFileSync(path.join(pluginDirectory, 'index.js'), indexJs);
      fs.writeFileSync(path.join(pluginDirectory, 'README.md'), readmeMd);

      // link the new package
      if (!this.evt.options.skipNpm) {
        execSync('cd ' + pluginDirectory + ' && npm link');
        execSync('cd ' + projectPath + ' && npm link ' + pluginName);
      }

      // TODO: Remove in V1 because will result in breaking change
      // Add the newly create plugin to the plugins array of the projects s-project.json file
      this.S.getProject().addPlugin( pluginName );
      this.S.getProject().save();

      // Add the newly created plugin to the package.json file of the project
      let projectPackageJson = SUtils.readFileSync(this.S.getProject().getRootPath('package.json'));
      projectPackageJson.dependencies[pluginName] = JSON.parse(packageJson).version;
      fs.writeFileSync(this.S.getProject().getRootPath('package.json'), JSON.stringify(projectPackageJson, null, 2));
    };
  }

  return( PluginCreate );
};