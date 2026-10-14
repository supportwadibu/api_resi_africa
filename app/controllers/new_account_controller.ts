import AuthController from '#controllers/auth/auth_controller'

export default class NewAccountController {
  store = new AuthController().registerInit
}
