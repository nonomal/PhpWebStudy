const { join, basename } = require('path')
const {
  existsSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  statSync
} = require('fs')
const { removeSync } = require('fs-extra')
const { spawn, execSync } = require('child_process')
const Utils = require('./Utils')
const BaseManager = require('./BaseManager')
const { exec: execPromise } = require('child-process-promise')
const { I18nT } = require('./lang/index.js')
const compressing = require('compressing')
class PhpManager extends BaseManager {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir, 'common/var/run/php-fpm.pid')
  }

  getIniPath(version) {
    let command = ''
    if (version?.phpBin) {
      command = `${version.phpBin} -i | grep php.ini`
    } else {
      command = `${version.path}/bin/php -i | grep php.ini`
    }
    let ini = execSync(command).toString().trim()
    ini = ini.split('=>').pop().trim()
    console.log('getIniPath: ', version, command, ini)
    if (ini) {
      if (!existsSync(ini)) {
        Utils.createFolder(ini)
        const iniPath = join(global.Server.PhpDir, 'common/conf/php.ini')
        const iniDefaultPath = join(global.Server.PhpDir, 'common/conf/php.ini.default')
        if (existsSync(iniPath)) {
          copyFileSync(iniPath, ini)
        } else if (existsSync(iniDefaultPath)) {
          copyFileSync(iniPath, ini)
        }
      }
      if (existsSync(ini)) {
        if (statSync(ini).isDirectory()) {
          const baseIni = join(ini, 'php.ini')
          ini = join(ini, 'php.ini-development')
          if (existsSync(ini) && !existsSync(baseIni)) {
            try {
              execSync(`echo '${global.Server.Password}' | sudo -S cp ${ini} ${baseIni}`)
              execSync(`echo '${global.Server.Password}' | sudo -S chmod 755 ${baseIni}`)
            } catch (e) {}
          }
          ini = baseIni
        }
        if (existsSync(ini)) {
          const iniDefault = `${ini}.default`
          if (!existsSync(iniDefault)) {
            try {
              execSync(`echo '${global.Server.Password}' | sudo -S cp ${ini} ${iniDefault}`)
            } catch (e) {}
          }
          this._processSend({
            code: 0,
            iniPath: ini
          })
          return
        }
      }
    }
    this._processSend({
      code: 1,
      msg: I18nT('fork.phpiniNoFound')
    })
  }

  installExtends(args) {
    const { version, versionNumber, extend, installExtensionDir } = args
    this._doInstallExtends(version, versionNumber, extend, installExtensionDir)
      .then(() => {
        let name = `${extend}.so`
        if (extend === 'sg11') {
          name = 'ixed.dar'
        }
        const installedSo = join(installExtensionDir, name)
        if (existsSync(installedSo)) {
          this._thenSuccess()
        } else {
          this._processSend({
            code: 1,
            msg: I18nT('fork.ExtensionInstallFail')
          })
        }
      })
      .catch((error) => {
        this._catchError(error)
      })
  }

  unInstallExtends() {
    this._thenSuccess()
  }

  _stopServer(version) {
    return new Promise((resolve, reject) => {
      const v = version.version.split('.').slice(0, 2).join('')
      const pidFile = join(global.Server.PhpDir, v, 'var/run/php-fpm.pid')
      let pid = 0
      try {
        if (existsSync(pidFile)) {
          pid = readFileSync(pidFile, 'utf-8')
        }
      } catch (e) {}
      if (pid) {
        const check = (times = 0) => {
          if (!existsSync(pidFile)) {
            resolve(0)
            return
          }
          if (times > 4) {
            reject(new Error(I18nT('fork.phpStopFail', { version: version.version })))
            return
          }
          setTimeout(() => {
            check(times + 1)
          }, 500)
        }
        execPromise(`echo '${global.Server.Password}' | sudo -S kill -INT ${pid}`)
          .then(() => {
            check()
          })
          .catch((e) => {
            const err = e.toString()
            if (err.includes('No such process')) {
              if (existsSync(pidFile)) {
                unlinkSync(pidFile)
                resolve(0)
              } else {
                reject(new Error(err))
              }
            }
          })
      } else {
        resolve(0)
      }
    })
  }

  startService(version) {
    this._stopServer(version)
      .then(() => {
        return this._startServer(version)
      })
      .then(() => {
        return this._resetEnablePhpConf(version)
      })
      .then(() => {
        return this._updateVhostPhpVersion(version)
      })
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  _resetEnablePhpConf(version) {
    return new Promise((resolve) => {
      const v = version.version.split('.').slice(0, 2).join('')
      let confPath = join(global.Server.NginxDir, 'common/conf/enable-php.conf')
      let tmplPath = join(global.Server.Static, 'tmpl/enable-php.conf')
      if (existsSync(tmplPath)) {
        let content = readFileSync(tmplPath, 'utf-8')
        const replace = `fastcgi_pass  unix:/tmp/phpwebstudy-php-cgi-${v}.sock;`
        content = content.replace('fastcgi_pass  unix:/tmp/phpwebstudy-php-cgi-80.sock;', replace)
        writeFileSync(confPath, content)
      }
      resolve(true)
    })
  }

  _updateVhostPhpVersion(version) {
    return new Promise((resolve) => {
      const hostFile = join(global.Server.BaseDir, 'host.json')
      let hostList = []
      let hasError = false
      if (existsSync(hostFile)) {
        try {
          hostList = JSON.parse(readFileSync(hostFile, 'utf-8'))
        } catch (e) {
          hasError = true
          console.log(e)
        }
      }
      if (hasError) {
        resolve(true)
        return
      }
      const setPhpVersion = (host) => {
        const name = host.name
        let nginxvpath = join(global.Server.BaseDir, 'vhost/nginx')
        let apachevpath = join(global.Server.BaseDir, 'vhost/apache')

        let nvhost = join(nginxvpath, `${name}.conf`)
        let avhost = join(apachevpath, `${name}.conf`)

        const v = version.version.split('.').slice(0, 2).join('')

        if (existsSync(nvhost)) {
          let content = readFileSync(nvhost, 'utf-8')
          const find = content.match(/include enable-php(.*?)\.conf;/g)
          const replace = `include enable-php-${v}.conf;`
          content = content.replace(find?.[0], replace)
          writeFileSync(nvhost, content)
        }

        if (existsSync(avhost)) {
          let content = readFileSync(avhost, 'utf-8')
          const find = content.match(/SetHandler "proxy:(.*?)"/g)
          const replace = `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${v}.sock|fcgi://localhost"`
          content = content.replace(find?.[0], replace)
          writeFileSync(avhost, content)
        }

        host.phpVersion = Number(v)
      }
      if (hostList.length > 0) {
        let needWrite = false
        hostList.forEach((h) => {
          if (!h?.phpVersion) {
            setPhpVersion(h)
            needWrite = true
          }
        })
        if (needWrite) {
          writeFileSync(hostFile, JSON.stringify(hostList))
        }
      }
      resolve(true)
    })
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      const v = version.version.split('.').slice(0, 2).join('')
      const confPath = join(global.Server.PhpDir, v, 'conf')
      const varPath = join(global.Server.PhpDir, v, 'var')
      const logPath = join(varPath, 'log')
      const runPath = join(varPath, 'run')
      Utils.createFolder(confPath)
      Utils.createFolder(varPath)
      Utils.createFolder(logPath)
      Utils.createFolder(runPath)

      const phpFpmConf = join(confPath, 'php-fpm.conf')
      console.log('phpFpmConf: ', phpFpmConf)
      if (!existsSync(phpFpmConf)) {
        const phpFpmConfTmpl = join(global.Server.Static, 'tmpl/php-fpm.conf')
        console.log('phpFpmConfTmpl: ', phpFpmConfTmpl)
        let content = readFileSync(phpFpmConfTmpl, 'utf-8')
        content = content.replace('##PHP-CGI-VERSION##', v)
        writeFileSync(phpFpmConf, content)
      }

      let opt = this._fixEnv()
      const child = spawn(bin, ['-p', varPath, '-y', phpFpmConf], opt)
      this._childHandle(child, resolve, reject)
    })
  }

  _doInstallExtends(version, versionNumber, extend, extendsDir) {
    return new Promise((resolve, reject) => {
      let optdefault = {
        env: {
          ...process.env
        }
      }
      if (!optdefault.env['PATH']) {
        optdefault.env[
          'PATH'
        ] = `${version.path}bin/:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
      } else {
        optdefault.env[
          'PATH'
        ] = `${version.path}bin/:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${optdefault.env['PATH']}`
      }
      if (global.Server.Proxy) {
        for (const k in global.Server.Proxy) {
          optdefault.env[k] = global.Server.Proxy[k]
        }
      }
      const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'

      const doRun = (copyfile, extendVersion, isPort = false) => {
        let params = [
          copyfile,
          global.Server.Cache,
          version.path,
          extendVersion,
          arch,
          global.Server.Password
        ]
        if (isPort) {
          params = [
            copyfile,
            global.Server.Cache,
            extendVersion,
            global.Server.Password,
            version.phpize,
            version.phpConfig
          ]
        }
        const command = params.join(' ')
        process.send({
          command: this.ipcCommand,
          key: this.ipcCommandKey,
          info: {
            code: 200,
            msg: I18nT('fork.ExtensionInstallFailTips', { command })
          }
        })
        const child = spawn('zsh', params, optdefault)
        this._childHandle(child, resolve, reject)
      }

      const installByMacports = (flag) => {
        if (version?.phpBin) {
          const name = `${basename(version.phpBin)}-${flag}`
          console.log('name: ', name)
          execPromise(
            `echo "y" | echo '${global.Server.Password}' | sudo -S port install ${name}`,
            optdefault
          )
            .then(() => {
              setTimeout(() => {
                if (existsSync(soPath)) {
                  resolve(true)
                } else {
                  reject(new Error(`port install ${name} fail`))
                }
              }, 1000)
            })
            .catch((e) => {
              reject(e)
            })
          return true
        }
        return false
      }

      let sh = ''
      let copyfile = ''
      let soPath = ''
      switch (extend) {
        case 'ionCube':
          soPath = join(extendsDir, 'ioncube.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          const tmplPath = join(global.Server.Cache, `ioncube_loader_mac_${versionNumber}.so`)
          const doCopy = () => {
            if (existsSync(tmplPath)) {
              if (!existsSync(extendsDir)) {
                execSync(`echo '${global.Server.Password}' | sudo -S mkdir -p ${extendsDir}`)
              }
              execSync(`echo '${global.Server.Password}' | sudo -S cp ${tmplPath} ${soPath}`)
              if (existsSync(soPath)) {
                resolve(true)
                return true
              }
            }
            return false
          }
          if (doCopy()) {
            return
          }
          const url = `http://mbimage.ybvips.com/electron/phpwebstudy/ioncube/ioncube_loader_mac_${versionNumber}.so`
          Utils.downFile(url, tmplPath)
            .then(() => {
              if (doCopy()) {
                return
              }
              reject(new Error('File Download Fail'))
            })
            .catch((err) => {
              console.log(err)
              reject(err)
            })
          break
        case 'redis':
          soPath = join(extendsDir, 'redis.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports('redis')) {
            return
          }
          sh = join(global.Server.Static, 'sh/php-redis.sh')
          copyfile = join(global.Server.Cache, 'php-redis.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = versionNumber < 7.0 ? '4.3.0' : '5.3.7'
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'memcache':
          soPath = join(extendsDir, 'memcache.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports('memcache')) {
            return
          }
          sh = join(global.Server.Static, 'sh/php-memcache.sh')
          copyfile = join(global.Server.Cache, 'php-memcache.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = versionNumber < 7.0 ? '3.0.8' : versionNumber >= 8.0 ? '8.2' : '4.0.5.2'
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'memcached':
          soPath = join(extendsDir, 'memcached.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports('memcached')) {
            return
          }
          sh = join(global.Server.Static, 'sh/php-memcached.sh')
          copyfile = join(global.Server.Cache, 'php-memcached.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = versionNumber < 7.0 ? '2.2.0' : '3.2.0'
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'swoole':
          soPath = join(extendsDir, 'swoole.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports('swoole')) {
            return
          }
          sh = join(global.Server.Static, 'sh/php-swoole.sh')
          copyfile = join(global.Server.Cache, 'php-swoole.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = ''
              if (versionNumber < 5.5) {
                extendv = '1.10.5'
              } else if (versionNumber < 7.0) {
                extendv = '2.2.0'
              } else if (versionNumber < 7.2) {
                extendv = '4.5.11'
              } else if (versionNumber < 8.0) {
                extendv = '4.8.11'
              } else {
                extendv = '5.0.3'
              }
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'xdebug':
          soPath = join(extendsDir, 'xdebug.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports('xdebug')) {
            return
          }
          sh = join(global.Server.Static, 'sh/php-xdebug.sh')
          copyfile = join(global.Server.Cache, 'php-xdebug.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = ''
              if (versionNumber < 7.2) {
                extendv = '2.5.5'
              } else {
                extendv = '3.1.5'
              }
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'xlswriter':
          soPath = join(extendsDir, 'xlswriter.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-xlswriter.sh')
          if (version?.phpBin) {
            sh = join(global.Server.Static, 'sh/php-xlswriter-port.sh')
          }
          copyfile = join(global.Server.Cache, 'php-xlswriter.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = '1.5.5'
              doRun(copyfile, extendv, version?.phpBin)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'ssh2':
          soPath = join(extendsDir, 'ssh2.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports('ssh2')) {
            return
          }
          sh = join(global.Server.Static, 'sh/php-ssh2.sh')
          copyfile = join(global.Server.Cache, 'php-ssh2.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = versionNumber < 7.0 ? '1.1.2' : '1.4'
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'pdo_sqlsrv':
          soPath = join(extendsDir, 'pdo_sqlsrv.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-pdo_sqlsrv.sh')
          if (version?.phpBin) {
            sh = join(global.Server.Static, 'sh/php-pdo_sqlsrv-port.sh')
          }
          copyfile = join(global.Server.Cache, 'php-pdo_sqlsrv.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = ''
              if (versionNumber < 7.0) {
                extendv = '3.0.1'
              } else if (versionNumber < 7.3) {
                extendv = '5.9.0'
              } else {
                extendv = '5.11.0'
              }
              doRun(copyfile, extendv, version?.phpBin)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'imagick':
          if (existsSync(join(extendsDir, 'imagick.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-imagick.sh')
          copyfile = join(global.Server.Cache, 'php-imagick.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = '3.7.0'
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'mongodb':
          if (existsSync(join(extendsDir, 'mongodb.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-mongodb.sh')
          copyfile = join(global.Server.Cache, 'php-mongodb.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = versionNumber < 7.2 ? '1.7.5' : '1.14.1'
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'yaf':
          if (existsSync(join(extendsDir, 'yaf.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-yaf.sh')
          copyfile = join(global.Server.Cache, 'php-yaf.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = versionNumber < 7.0 ? '2.3.5' : '3.3.5'
              doRun(copyfile, extendv)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'sg11':
          if (existsSync(join(extendsDir, 'ixed.dar'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-sg11.sh')
          copyfile = join(global.Server.Cache, 'php-sg11.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let versionNums = version.version.split('.')
              versionNums.splice(2)
              versionNums = versionNums.join('.')
              let archStr = ''
              if (versionNumber >= 7.4 && arch === '-arm64') {
                archStr = arch
              }
              const params = [copyfile, global.Server.Cache, extendsDir, versionNums, archStr]
              const command = params.join(' ')
              process.send({
                command: this.ipcCommand,
                key: this.ipcCommandKey,
                info: {
                  code: 200,
                  msg: I18nT('fork.ExtensionInstallFailTips', { command })
                }
              })
              const child = spawn('zsh', params, optdefault)
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
      }
    })
  }

  doObfuscator(params) {
    const cacheDir = global.Server.Cache
    const obfuscatorDir = join(cacheDir, 'php-obfuscator')
    removeSync(obfuscatorDir)
    const zipFile = join(global.Server.Static, 'zip/php-obfuscator.zip')
    compressing.zip
      .uncompress(zipFile, obfuscatorDir)
      .then(() => {
        const bin = join(obfuscatorDir, 'yakpro-po.php')
        let command = ''
        if (params.config) {
          const configFile = join(cacheDir, 'php-obfuscator.cnf')
          writeFileSync(configFile, params.config)
          command = `${params.bin} ${bin} --config-file ${configFile} ${params.src} -o ${params.desc}`
        } else {
          command = `${params.bin} ${bin} ${params.src} -o ${params.desc}`
        }
        console.log('command: ', command)
        return execPromise(command)
      })
      .then(() => {
        this._thenSuccess()
      })
      .catch((e) => {
        this._processSend({
          code: 1,
          msg: e.toString()
        })
      })
  }
}
module.exports = PhpManager
