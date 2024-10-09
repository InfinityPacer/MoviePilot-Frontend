import store from '@/store'
import api from './index'

// 定义 API 响应的接口
interface ResourceTokenResponse {
  access_token: string
  expire: number // 单位：秒
}

// 资源管理器类，用于获取和刷新资源令牌
class ResourceManager {
  // 缓冲时间，单位毫秒
  private readonly bufferTime: number
  // 标记是否正在获取资源令牌
  private isFetchingResourceToken: boolean = false
  // 当前的获取资源令牌的 Promise
  private fetchPromise: Promise<string | null> | null = null

  /**
   * 构造函数
   * @param bufferTime 缓冲时间，单位毫秒，默认值为 10000 毫秒（10秒）
   */
  constructor(bufferTime: number = 10000) {
    this.bufferTime = bufferTime
  }

  /**
   * 获取资源令牌
   * @returns {Promise<string | null>} 资源令牌或 null（获取失败时）
   */
  async getResourceToken(): Promise<string | null> {
    const resourceToken = store.state.auth.resourceToken
    const resourceTokenExpire = store.state.auth.resourceTokenExpire
    const now = Date.now()

    // 检查是否存在有效的资源令牌
    if (resourceToken && resourceTokenExpire && now < resourceTokenExpire) {
      // 如果令牌即将过期，提前刷新
      if (resourceTokenExpire - now <= this.bufferTime) {
        this.refreshResourceToken().catch(error => {
          console.error('Failed to refresh resource token:', error)
        })
      }
      return resourceToken
    }

    // 如果正在获取令牌，返回当前的 Promise
    if (this.isFetchingResourceToken && this.fetchPromise) {
      return this.fetchPromise
    }

    // 开始获取新的资源令牌
    this.isFetchingResourceToken = true
    this.fetchPromise = this.fetchResourceToken()
      .then(newToken => {
        this.resetFetchState()
        if (!newToken) {
          console.error('Failed to obtain resource token: Token is null or undefined')
          return null
        }
        return newToken
      })
      .catch(error => {
        this.resetFetchState()
        console.error('Error in fetchResourceToken:', error)
        return null
      })

    return this.fetchPromise
  }

  /**
   * 刷新资源令牌
   */
  async refreshResourceToken() {
    // 如果已经在获取令牌，直接返回
    if (this.isFetchingResourceToken) return
    this.isFetchingResourceToken = true
    try {
      const newToken = await this.fetchResourceToken()
      if (!newToken) {
        console.error('Failed to refresh resource token')
      }
    } catch (error) {
      console.error('Error refreshing resource token:', error)
    } finally {
      this.resetFetchState()
    }
  }

  /**
   * 通过 API 获取资源令牌，提取通用的获取和存储逻辑
   * @returns {Promise<string>} 新的资源令牌
   */
  private async fetchResourceToken(): Promise<string> {
    const response: ResourceTokenResponse = await api.post('system/resource-token')
    if (response.access_token && response.expire) {
      // 将 expire 时间从秒转换为毫秒
      const expireInMs = Date.now() + response.expire * 1000
      // 更新 store 中的资源令牌和过期时间
      store.dispatch('auth/setResourceToken', { token: response.access_token, expire: expireInMs })
      return response.access_token
    } else {
      throw new Error('Invalid resource token response.')
    }
  }

  /**
   * 重置获取令牌的状态
   */
  private resetFetchState() {
    this.isFetchingResourceToken = false
    this.fetchPromise = null
  }
}

// 使用时创建单例或注入到系统中
const resource = new ResourceManager()
export default resource
