import { AIBase } from '@/components/AI/AIBase'
import { merge } from 'lodash'
import type { ChatItem } from '@/components/AI/setup'
import { reactive } from 'vue'
import { MessageError } from '@/util/Element'
import { fileSelect } from '@/util/Index'
import { useBase64 } from '@vueuse/core'
import IPC from '@/util/IPC'
import { AISetup } from '@/components/AI/setup'

type ToolCallItem = {
  function: {
    name: string
    arguments: Record<string, string>
  }
}

export class AIOllama extends AIBase {
  private async _HanleToolCalls(tools: ToolCallItem[]) {
    for (const tool of tools) {
      if (tool.function.name === 'get_folder_all_files') {

      }
    }
  }

  request(param: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.streaming = true
      const baseUrl = AISetup.ollamaServer.url
      const model = AISetup.ollamaServer.model
      let messageObj: ChatItem | undefined = undefined
      let message = ''
      const data = {
        url: `${baseUrl}/api/chat`,
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'post',
        responseType: 'stream',
        data: merge(
          {
            model: model,
            stream: true,
            messages: [],
            options: {
              temperature: this.temperature
            },
            tools: [
              {
                type: 'function',
                function: {
                  name: 'get_folder_all_files',
                  description: '获取文件夹下所有文件',
                  parameters: {
                    type: 'object',
                    properties: {
                      dir: {
                        type: 'string',
                        description: '需要获取文件的文件夹路径.'
                      }
                    },
                    required: ['dir']
                  }
                }
              }
            ]
          },
          param
        )
      }
      IPC.send('app-fork:ollama', 'chat', data, AISetup.trialStartTime).then(
        (key: string, res: any) => {
          console.log('ollama chat res: ', res)
          if (res?.code === 0) {
            IPC.off(key)
            this.onStreamEnd()
            resolve(true)
          } else if (res?.code === 1) {
            IPC.off(key)
            MessageError(res?.msg)
            reject(new Error(res?.msg))
          } else if (res?.code === 200) {
            const json: any = res.msg
            message += json.message.content
            if (json.message.tool_calls) {
              message += '开始执行'
            }
            if (!messageObj) {
              messageObj = reactive({
                role: 'assistant',
                content: message,
                model
              } as any)
              this.chatList.push(messageObj!)
            } else {
              messageObj.content = message
            }
          }
        }
      )
    })
  }

  send() {
    if (!this.content.trim()) {
      return
    }

    const messages = [...this.chatList].filter((f) => !f.error && f.role !== 'system')
    const arr: ChatItem[] = []
    arr.push(
      reactive({
        role: 'user',
        content: this.content
      })
    )
    messages.push(...arr)
    messages.unshift({
      role: 'system',
      content: this.prompt
    })
    this.chatList.push(...arr)
    this.content = ''
    this.request({ messages })
      .then()
      .catch((e: any) => {
        arr.forEach((a) => (a.error = `${e}`))
      })
      .finally(() => {
        AISetup.save()
      })
  }

  sendNotMake() {
    if (!this.content.trim()) {
      return
    }

    this.chatList.push(
      reactive({
        role: 'user',
        content: this.content
      })
    )
    this.content = ''
  }

  sendImage() {
    fileSelect('image/*', true).then((files: FileList) => {
      console.log('choosePath files: ', files)
      if (files.length > 0) {
        const all = Array.from(files).map((file) => useBase64(file).execute())
        Promise.all(all).then((images) => {
          const messages = [...this.chatList].filter((f) => !f.error && f.role !== 'system')
          const arr: ChatItem[] = []
          arr.push(
            reactive({
              role: 'user',
              content: '',
              images
            })
          )
          messages.push(...arr)
          messages.unshift({
            role: 'system',
            content: this.prompt
          })
          this.chatList.push(...arr)
          this.request({ messages })
            .then()
            .catch((e: any) => {
              arr.forEach((a) => (a.error = `${e}`))
            })
            .finally(() => {
              AISetup.save()
            })
        })
      }
    })
  }
}
