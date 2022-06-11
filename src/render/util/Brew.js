import { execAsync } from '@shared/utils.js'
import IPC from './IPC.js'
import Base from '@/core/Base.js'
import store from '@/store/index.js'
import { ElMessageBox } from 'element-plus'

/**
 * 电脑密码检测, 很多操作需要电脑密码
 * @returns {Promise<unknown>}
 */
export const passwordCheck = () => {
  return new Promise((resolve) => {
    if (!global.Server.Password) {
      ElMessageBox.prompt('请输入电脑用户密码', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputType: 'password',
        customClass: 'password-prompt',
        beforeClose: (action, instance, done) => {
          if (action === 'confirm') {
            // 去除trim, 有些电脑的密码是空格...
            if (instance.inputValue) {
              IPC.send('app:password-check', instance.inputValue).then((key, res) => {
                IPC.off(key)
                if (res === false) {
                  instance.editorErrorMessage = '密码错误,请重新输入'
                } else {
                  global.Server.Password = res
                  store.dispatch('app/initConfig').then(() => {
                    done && done()
                    resolve(true)
                  })
                }
              })
            }
          } else {
            done()
          }
        }
      })
        .then(() => {})
        .catch((err) => {
          console.log('err: ', err)
        })
    } else {
      resolve(true)
    }
  })
}

/**
 * 检测brew是否安装
 * @returns {Promise<unknown>}
 */
export const brewCheck = () => {
  return new Promise((resolve) => {
    passwordCheck().then(() => {
      if (!global.Server.BrewHome) {
        if (!store.getters['brew/brewRunning']) {
          Base.ConfirmInfo('检测到您未安装Brew, 是否现在安装?').then(() => {
            store.commit('brew/SET_BREW_RUNNING', true)
            const log = store.getters['brew/log']
            log.splice(0)
            store.commit('brew/SET_SHOW_INSTALL_LOG', true)
            IPC.send('app-fork:brew', 'installBrew').then((key, info) => {
              console.log('key: ', key, 'info: ', info)
              if (info.code === 0) {
                IPC.off(key)
                store.commit('brew/SET_SHOW_INSTALL_LOG', false)
                store.commit('brew/SET_BREW_RUNNING', false)
                resolve(true)
              } else if (info.code === 1) {
                IPC.off(key)
                store.commit('brew/SET_SHOW_INSTALL_LOG', false)
                store.commit('brew/SET_BREW_RUNNING', false)
                Base.MessageError('Brew安装失败, 请尝试自行安装')
              } else if (info.code === 200) {
                const msg = info.msg.replace('<br/>', '').trim()
                if (msg.endsWith('%')) {
                  log.pop()
                }
                log.push(msg)
              }
            })
          })
        }
      } else {
        resolve(true)
      }
    })
  })
}

export function brewInstalledList() {
  return new Promise((resolve) => {
    brewCheck().then(() => {
      execAsync('brew', ['ls']).then((res) => {
        const arr = res
          .split('\n==> Casks')[0]
          .replace('==> Formulae\n', '')
          .trim()
          .split('\n')
          .filter((r) => {
            return r.length > 0
          })
        resolve(arr)
      })
    })
  })
}

const SearchExclude = ['shivammathur/php/php']

export function brewSearchList(key) {
  return new Promise((resolve) => {
    brewCheck().then(() => {
      execAsync('brew', ['search', `/${key}\[@\]\?/`]).then((res) => {
        const arr = res
          .split('\n==> Casks')[0]
          .replace('==> Formulae\n', '')
          .trim()
          .split('\n')
          .filter((r) => {
            return r.length > 0 && (SearchExclude.includes(r) || r === key || r.includes(`${key}@`))
          })
        resolve(arr)
      })
    })
  })
}

export function brewInfo(key) {
  return new Promise((resolve, reject) => {
    IPC.send('app-fork:brew', 'brewinfo', key).then((key, res) => {
      IPC.off(key)
      if (res.code === 0) {
        resolve(res.data)
      } else {
        reject(new Error(`未找到Brew库${key}`))
      }
    })
  })
}