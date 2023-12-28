import { Base } from './Base'
import { execPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '../lang'

class Manager extends Base {
  constructor() {
    super()
  }

  allVersion(dir: string) {
    return new ForkPromise((resolve, reject) => {
      execPromise(
        '[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm ls-remote',
        {
          env: {
            NVM_DIR: dir
          }
        }
      )
        .then((res) => {
          const str = res?.stdout ?? ''
          const all =
            str?.match(/\sv\d+(\.\d+){1,4}\s/g)?.map((v) => {
              return v.trim().replace('v', '')
            }) ?? []
          resolve(all.reverse())
        })
        .catch(reject)
    })
  }

  localVersion(dir: string) {
    return new ForkPromise((resolve, reject) => {
      execPromise(
        '[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm ls',
        {
          env: {
            NVM_DIR: dir
          }
        }
      )
        .then((res) => {
          const str = res.stdout
          const ls = str.split('default')[0]
          const localVersions = ls.match(/\d+(\.\d+){1,4}/g)
          const reg = /default.*?(\d+(\.\d+){1,4}).*?\(/g
          let current: any = reg.exec(str)
          if (current?.length > 1) {
            current = current[1]
          } else {
            current = ''
          }
          resolve({
            versions: localVersions,
            current: current
          })
        })
        .catch(reject)
    })
  }

  versionChange(dir: string, select: string) {
    return new ForkPromise((resolve, reject) => {
      execPromise(
        `[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm install v${select};nvm alias default ${select}`,
        {
          env: {
            NVM_DIR: dir
          }
        }
      )
        .then(resolve)
        .catch(reject)
    })
  }

  installNvm() {
    return execPromise(
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash'
    )
  }

  nvmDir() {
    return new ForkPromise((resolve, reject) => {
      execPromise(
        '[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";echo $NVM_DIR'
      )
        .then((res) => {
          console.log('$NVM_DIR: ', res.stdout.trim())
          const NVM_DIR = res.stdout.trim()
          // 已安装
          if (NVM_DIR.length > 0) {
            resolve(NVM_DIR)
          } else {
            reject(new Error(I18nT('fork.nvmDirNoFound')))
          }
        })
        .catch(reject)
    })
  }
}

export default new Manager()