import { middleware } from '#start/kernel'

import router from '@adonisjs/core/services/router'

const AuthController = () => import('#controllers/auth/auth_controller')
const CronController = () => import('#controllers/cron_controller')
const AdminPlansController = () => import('#controllers/admin/plans_controller')
const AdminFeedbackController = () => import('#controllers/admin/feedback_controller')
const ProprioProfileController = () => import('#controllers/proprio/profile_controller')
const ProprioPropertyController = () => import('#controllers/proprio/property_controller')
const ProprioPropertyImageController = () =>
  import('#controllers/proprio/property_image_controller')
const ProprioBookingController = () => import('#controllers/proprio/booking_controller')
const ProprioResidenceController = () => import('#controllers/proprio/residence_controller')
const ProprioClientController = () => import('#controllers/proprio/client_controller')
const ProprioExpenseController = () => import('#controllers/proprio/expense_controller')
const ProprioFinanceController = () => import('#controllers/proprio/finance_controller')
const ProprioReportController = () => import('#controllers/proprio/report_controller')
const ProprioSubscriptionController = () => import('#controllers/proprio/subscription_controller')
const ProprioFeedbackController = () => import('#controllers/proprio/feedback_controller')
const ProprioManagerController = () => import('#controllers/proprio/manager_controller')
const GerantPropertyController = () => import('#controllers/gerant/property_controller')
const GerantResidenceController = () => import('#controllers/gerant/residence_controller')
const GerantBookingController = () => import('#controllers/gerant/booking_controller')
const GerantClientController = () => import('#controllers/gerant/client_controller')
const GerantExpenseController = () => import('#controllers/gerant/expense_controller')
const GerantFinanceController = () => import('#controllers/gerant/finance_controller')
const GerantProfileController = () => import('#controllers/gerant/profile_controller')
const ClientPropertyController = () => import('#controllers/client/property_controller')
const ClientBookingController = () => import('#controllers/client/booking_controller')
const ClientBookingPaymentController = () =>
  import('#controllers/client/booking_payment_controller')

router.get('/', () => {
  return { hello: 'world' }
})

router
  .group(() => {
    router
      .group(() => {
        router.post('register/init', [AuthController, 'registerInit'])
        router.post('register/verify', [AuthController, 'registerVerify'])
        router.post('login', [AuthController, 'login'])
        router.post('google', [AuthController, 'google'])
        router.post('refresh', [AuthController, 'refresh'])
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.post('logout', [AuthController, 'logout'])
        router.get('me', [AuthController, 'me'])
      })
      .prefix('auth')
      .as('auth.protected')
      .use(middleware.auth())

    router
      .group(() => {
        router
          .group(() => {
            router.get('/', [AdminPlansController, 'index'])
            router.post('/', [AdminPlansController, 'store'])
            router.get(':id', [AdminPlansController, 'show'])
            router.patch(':id', [AdminPlansController, 'update'])
            router.delete(':id', [AdminPlansController, 'destroy'])
          })
          .prefix('plans')
          .as('plans')

        router
          .group(() => {
            router.get('/', [AdminFeedbackController, 'index'])
            router.get(':id', [AdminFeedbackController, 'show'])
            router.patch(':id/status', [AdminFeedbackController, 'updateStatus'])
          })
          .prefix('feedbacks')
          .as('feedbacks')
      })
      .prefix('admin')
      .as('admin')
      .use([middleware.auth(), middleware.role(['admin'])])

    router
      .group(() => {
        router
          .group(() => {
            router.get('/', [ProprioPropertyController, 'index'])
            router.get('stats', [ProprioPropertyController, 'stats'])
            // Avant `:id`, sinon « availability » serait pris pour un identifiant.
            router.get('availability', [ProprioPropertyController, 'availability'])
            router.post('/', [ProprioPropertyController, 'store'])
            router.post('images', [ProprioPropertyImageController, 'store'])
            router.get(':id', [ProprioPropertyController, 'show'])
            router.patch(':id', [ProprioPropertyController, 'update'])
            router.delete(':id', [ProprioPropertyController, 'destroy'])
            router.patch(':id/residence', [ProprioPropertyController, 'attachResidence'])
            router.patch(':id/publish', [ProprioPropertyController, 'publish'])
            router.patch(':id/unpublish', [ProprioPropertyController, 'unpublish'])
          })
          .prefix('properties')
          .as('properties')

        router
          .group(() => {
            router.get('/', [ProprioResidenceController, 'index'])
            router.post('/', [ProprioResidenceController, 'store'])
            router.get(':id', [ProprioResidenceController, 'show'])
            router.patch(':id', [ProprioResidenceController, 'update'])
            router.delete(':id', [ProprioResidenceController, 'destroy'])
          })
          .prefix('residences')
          .as('residences')

        router
          .group(() => {
            router.get('/', [ProprioProfileController, 'show'])
            router.post('/', [ProprioProfileController, 'store'])
          })
          .prefix('profile')
          .as('profile')

        router
          .group(() => {
            router.get('/', [ProprioBookingController, 'index'])
            // Avant `:id`, sinon « stats » serait pris pour un identifiant.
            router.get('stats', [ProprioBookingController, 'stats'])
            router.post('/', [ProprioBookingController, 'store'])
            router.get(':id/check-out/preview', [ProprioBookingController, 'checkOutPreview'])
            router.patch(':id/check-out', [ProprioBookingController, 'checkOut'])
            router.patch(':id/extend', [ProprioBookingController, 'extend'])
          })
          .prefix('bookings')
          .as('bookings')

        router
          .group(() => {
            router.get('/', [ProprioClientController, 'index'])
            // Avant `:id`, sinon « lookup » serait pris pour un identifiant.
            router.post('lookup', [ProprioClientController, 'lookup'])
            router.post('/', [ProprioClientController, 'store'])
            router.get(':id', [ProprioClientController, 'show'])
            router.get(':id/bookings', [ProprioClientController, 'bookings'])
            router.patch(':id', [ProprioClientController, 'update'])
          })
          .prefix('clients')
          .as('clients')

        router
          .group(() => {
            router.get('/', [ProprioExpenseController, 'index'])
            // Avant `:id`, sinon « summary » serait pris pour un identifiant.
            router.get('summary', [ProprioExpenseController, 'summary'])
            router.post('/', [ProprioExpenseController, 'store'])
            router.get(':id', [ProprioExpenseController, 'show'])
            router.patch(':id', [ProprioExpenseController, 'update'])
            router.delete(':id', [ProprioExpenseController, 'destroy'])
          })
          .prefix('expenses')
          .as('expenses')

        router
          .group(() => {
            router.get('overview', [ProprioFinanceController, 'overview'])
          })
          .prefix('finance')
          .as('finance')

        router
          .group(() => {
            router.post('/', [ProprioReportController, 'store'])
          })
          .prefix('reports')
          .as('reports')

        router
          .group(() => {
            router.get('/', [ProprioFeedbackController, 'index'])
            router.post('/', [ProprioFeedbackController, 'store'])
          })
          .prefix('feedbacks')
          .as('feedbacks')

        router
          .group(() => {
            router.get('/', [ProprioManagerController, 'index'])
            router.post('/', [ProprioManagerController, 'store'])
            router.get(':id', [ProprioManagerController, 'show'])
            router.patch(':id', [ProprioManagerController, 'update'])
            // `PUT` : le propriétaire envoie le périmètre complet, si bien
            // qu'un ajout et un retrait faits ensemble deviennent une seule
            // écriture et que l'état obtenu ne dépend pas de l'ordre des
            // requêtes.
            router.put(':id/properties', [ProprioManagerController, 'replaceProperties'])
            router.patch(':id/status', [ProprioManagerController, 'setStatus'])
          })
          .prefix('managers')
          .as('managers')

        router.get('subscription', [ProprioSubscriptionController, 'show']).as('subscription')
      })
      .prefix('proprio')
      .as('proprio')
      .use([middleware.auth(), middleware.role(['proprio'])])

    /**
     * Espace du gérant.
     *
     * Préfixe dédié plutôt qu'une ouverture des routes `proprio` à deux rôles :
     * le périmètre du gérant se lit d'un coup d'œil ici, et **ce qui n'y figure
     * pas lui est fermé par construction** — non par une condition qu'on peut
     * oublier d'écrire. Restent donc hors d'atteinte : l'abonnement et la
     * facturation, la création et la suppression de logements et de résidences,
     * la modification des tarifs, la gestion des gérants, les rapports
     * exportables et les feedbacks.
     *
     * `scope()` s'exécute après `auth()` et `role()` : il lit l'affectation et
     * pose `ctx.scope`, dont dépend chaque contrôleur du groupe.
     */
    router
      .group(() => {
        router
          .group(() => {
            router.get('/', [GerantPropertyController, 'index'])
            // Avant `:id`, sinon « availability » serait pris pour un identifiant.
            router.get('availability', [GerantPropertyController, 'availability'])
            router.get(':id', [GerantPropertyController, 'show'])
            // Disponibilité seule : ni tarif, ni mise en ligne, ni suppression.
            router.patch(':id/availability', [GerantPropertyController, 'updateAvailability'])
          })
          .prefix('properties')
          .as('properties')

        // Regroupement d'affichage, en lecture seule : les résidences
        // contenant au moins un logement du périmètre, réduites à ces
        // logements-là.
        router
          .group(() => {
            router.get('/', [GerantResidenceController, 'index'])
          })
          .prefix('residences')
          .as('residences')

        router
          .group(() => {
            router.get('/', [GerantBookingController, 'index'])
            // Avant `:id`, sinon « stats » serait pris pour un identifiant.
            router.get('stats', [GerantBookingController, 'stats'])
            router.post('/', [GerantBookingController, 'store'])
            router.get(':id', [GerantBookingController, 'show'])
            router.patch(':id', [GerantBookingController, 'update']).as('update')
            router.patch(':id/cancel', [GerantBookingController, 'cancel'])
            // Mêmes verbes et mêmes chemins que côté propriétaire : le mobile
            // ne fait que substituer le préfixe, et un `POST` ici lui rendrait
            // un 404 muet.
            router.get(':id/check-out/preview', [GerantBookingController, 'checkOutPreview'])
            router.patch(':id/check-out', [GerantBookingController, 'checkOut'])
            router.patch(':id/extend', [GerantBookingController, 'update']).as('extend')
            router.post(':id/payments', [GerantBookingController, 'recordPayment'])
          })
          .prefix('bookings')
          .as('bookings')

        router
          .group(() => {
            router.get('/', [GerantClientController, 'index'])
            // Avant `:id`, sinon « lookup » serait pris pour un identifiant.
            router.post('lookup', [GerantClientController, 'lookup'])
            router.post('/', [GerantClientController, 'store'])
            router.get(':id', [GerantClientController, 'show'])
            router.get(':id/bookings', [GerantClientController, 'bookings'])
            router.patch(':id', [GerantClientController, 'update'])
          })
          .prefix('clients')
          .as('clients')

        router
          .group(() => {
            router.get('/', [GerantExpenseController, 'index'])
            // Avant `:id`, sinon « summary » serait pris pour un identifiant.
            router.get('summary', [GerantExpenseController, 'summary'])
            router.post('/', [GerantExpenseController, 'store'])
            router.patch(':id', [GerantExpenseController, 'update'])
            router.delete(':id', [GerantExpenseController, 'destroy'])
          })
          .prefix('expenses')
          .as('expenses')

        // Brut du périmètre, jamais le net : voir `ManagerOverviewDto`.
        router
          .group(() => {
            router.get('overview', [GerantFinanceController, 'overview'])
          })
          .prefix('finance')
          .as('finance')

        router
          .group(() => {
            router.get('/', [GerantProfileController, 'show'])
            router.patch('/', [GerantProfileController, 'update'])
          })
          .prefix('profile')
          .as('profile')
      })
      .prefix('gerant')
      .as('gerant')
      .use([middleware.auth(), middleware.role(['gerant']), middleware.scope()])

    router
      .group(() => {
        router
          .group(() => {
            router.get('/', [ClientPropertyController, 'index'])
            router.get('search', [ClientPropertyController, 'search'])
            router.get('featured', [ClientPropertyController, 'featured'])
            router.post(':property_id/bookings', [ClientBookingController, 'store'])
            router.get(':id', [ClientPropertyController, 'show'])
          })
          .prefix('properties')
          .as('properties')

        router
          .group(() => {
            router.get('/', [ClientBookingController, 'index'])
            router.patch(':id', [ClientBookingController, 'update'])
            router.patch(':id/cancel', [ClientBookingController, 'cancel'])
            router.post(':id/payments/wave/init', [
              ClientBookingPaymentController,
              'initializeWave',
            ])
          })
          .prefix('bookings')
          .as('bookings')
      })
      .prefix('client')
      .as('client')

    router.post('payments/wave/webhook', [ClientBookingPaymentController, 'waveWebhook'])

    router
      .group(() => {
        router.route('expire-trials', ['GET', 'POST'], [CronController, 'expireTrials'])
        router.get('health', [CronController, 'health'])
      })
      .prefix('cron')
      .as('cron')
      .use(middleware.cron())
  })
  .prefix('/api/v1')
