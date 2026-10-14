import AuthController from '#controllers/auth/auth_controller'

export default class AccessTokensController {
  store = new AuthController().login
  destroy = new AuthController().logout
}
