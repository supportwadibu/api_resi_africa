# App client lot 1 — volet Flutter — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une app client (`client/`) qui permet de découvrir les résidences sur une carte et en cartes à faire glisser, d'ouvrir une fiche, de réserver des dates et de payer par Wave, puis de retrouver ses réservations.

**Architecture:** Découpage par feature (`explore`, `search`, `discover`, `property`, `booking`, `bookings`, `favorites`, `auth`, `profile`), chacune en `business_logic/` (cubit + state), `data/` (modèles, repositories) et `presentation/` (screens, widgets). Le transverse vit dans `lib/core/` (auth, localisation, réseau, routeur). Toute logique de calcul (prix, occupation, tri, paramètres de recherche) est une fonction pure testée en unitaire ; les écrans composent les widgets de `lib/shared/widgets/`.

**Tech Stack:** Flutter 3.38.3 / Dart 3.10.1, flutter_bloc (Cubit), get_it, auto_route 11.1.x, Dio, easy_localization, google_maps_flutter, geolocator, flutter_secure_storage, google_sign_in, url_launcher, cached_network_image.

**Spec:** `api/docs/superpowers/specs/2026-10-08-app-client-lot1-design.md`
**Prérequis:** le plan API `api/docs/superpowers/plans/2026-10-08-app-client-lot1-api.md` est exécuté (routes client authentifiées, disponibilité publique, `confirm`, `role_name` Google, historique enrichi).

## Global Constraints

- Package Dart `resi_client` ; identifiant `africa.resi.client` ; Android + iOS.
- Commentaires, messages et commits en français ; identifiants en anglais.
- Cubits uniquement ; states en hiérarchie `sealed` de classes `final` ; `if (!isClosed)` avant chaque `emit` suivant un `await` ; `AppFailure` attrapée et convertie en état d'erreur.
- Aucune `DioException` au-dessus d'un repository : `AppFailure.fromDio`. On lit `statusCode` ou `code`, jamais le texte.
- DI dans `lib/core/di/service_locator.dart` : `registerSingleton` (infrastructure), `registerLazySingleton` (repositories, services, cubits de session), `registerFactory` / `registerFactoryParam` (cubits d'écran).
- Pas de chaîne en dur dans un widget : clés de `assets/translations/{fr,en}.json`. Chaque tâche liste les clés qu'elle ajoute, dans les deux langues.
- Thème : jetons `context.tokens`, typographie `context.text`, rayons `AppRadius` ; pas de `BorderRadius.circular`, pas de `Color(0x…)` hors `core/theme`, pas d'ombre sur le contenu, pas de dégradé hors du voile `tokens.overlay` sur photo ; lisible en clair et en sombre.
- Icônes `lucide_icons_flutter` (`LucideIcons.*`).
- Chaque dépendance ajoutée au `pubspec.yaml` porte un commentaire qui la justifie.
- Après tout ajout ou renommage d'écran : `dart run build_runner build --delete-conflicting-outputs` ; les `.gr.dart` ne s'éditent jamais à la main.
- Aucune coordonnée de propriétaire affichée nulle part (règle anti-contournement).
- Commandes depuis `client/` : `flutter analyze`, `flutter test`.
- Commits conventionnels en français **uniquement si l'utilisateur l'a demandé** (CLAUDE.md).

## Écarts assumés par rapport à la spec

1. **Suggestions de destination** : villes seulement (liste `assets/data/cities/ci.json` reprise de l'app propriétaire). L'API ne filtre que `city` ; proposer des communes promettrait un filtre qui n'existe pas.
2. **Tri « Prix croissant »** : appliqué sur le téléphone, page par page, comme « Plus proches » — l'API ignore `sort`.
3. **Garde de connexion** : `AuthGuard` sur « Mes réservations » et « Profil » ; pour le paiement, `requireSession(context)` dans la feuille de réservation, qui garde dates et code promo à l'écran pendant la connexion.

## Review Focus

- Glissement lent mais long vs geste vif mais court : seuil de distance **ou** de vitesse (Task 9).
- Dernière carte glissée sans page suivante : écran « Vous avez tout vu », pas de pile vide muette (Task 9).
- Paiement revenu `pending` à chaque tentative : état « vérification en cours », pas de boucle infinie (Task 11).
- Compte propriétaire qui se connecte dans l'app client : refus explicite et session révoquée (Task 4).
- Localisation refusée : carte centrée sur Abidjan, aucune redemande automatique (Task 7).

---

### Task 1 : modèles, endpoints et formatage des montants

**Files:**
- Modify: `client/lib/core/api/api_endpoints.dart`
- Create: `client/lib/shared/models/page_meta.dart`
- Create: `client/lib/shared/utils/money.dart`
- Create: `client/lib/features/property/data/models/property_model.dart`
- Test: `client/test/features/property/property_model_test.dart`, `client/test/shared/money_test.dart`

**Interfaces:**
- Produces:
  - `ApiEndpoints` : `login`, `registerInit`, `registerVerify`, `google`, `refresh`, `logout`, `properties`, `featured`, `property(id)`, `availability(id)`, `createBooking(propertyId)`, `bookings`, `waveInit(bookingId)`, `waveConfirm(bookingId)`.
  - `class PageMeta { int total, perPage, currentPage, lastPage; bool get hasMore; factory PageMeta.fromJson(Map) }` et `class Page<T> { List<T> items; PageMeta meta }`.
  - `String formatFcfa(int amount)` → `"40 000 F"`.
  - `class PriceTier { int minDays; int discountPercent }`, `class PropertyModel` (champs ci-dessous), `fromJson`, `toJson`, `bool get hasLocation`.

- [ ] **Step 1 : écrire les tests qui échouent**

`client/test/shared/money_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/shared/utils/money.dart';

void main() {
  test('groupe les milliers et suffixe F', () {
    expect(formatFcfa(40000), '40 000 F');
    expect(formatFcfa(1250000), '1 250 000 F');
    expect(formatFcfa(0), '0 F');
  });
}
```

`client/test/features/property/property_model_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/features/property/data/models/property_model.dart';

Map<String, dynamic> _json() => {
  'id': 'p1',
  'title': 'Villa Cocody Riviera',
  'description': 'Belle villa',
  'property_type': 'villa',
  'address': {
    'street': 'Rue des Jardins',
    'city': 'Abidjan',
    'coordinates': {'latitude': 5.36, 'longitude': -3.98},
  },
  'details': {'bedrooms': 3, 'bathrooms': 2, 'surface_area': 120},
  'amenities': {'pool': true, 'wifi': true, 'gym': false},
  'media': {'images': ['a.jpg', 'b.jpg']},
  'pricing': {
    'daily_price': 40000,
    'price_tiers': [
      {'min_days': 7, 'discount_percent': 10},
    ],
    'minimum_stay_days': 1,
    'maximum_stay_days': null,
  },
  'visibility': {'is_public': true, 'featured': true},
};

void main() {
  test('lit une résidence de l’API', () {
    final p = PropertyModel.fromJson(_json());
    expect(p.title, 'Villa Cocody Riviera');
    expect(p.city, 'Abidjan');
    expect(p.latitude, 5.36);
    expect(p.bedrooms, 3);
    expect(p.amenities, {'pool', 'wifi'});
    expect(p.images, ['a.jpg', 'b.jpg']);
    expect(p.dailyPrice, 40000);
    expect(p.priceTiers.single.discountPercent, 10);
    expect(p.featured, isTrue);
    expect(p.hasLocation, isTrue);
  });

  test('tolère des coordonnées à plat et des champs absents', () {
    final p = PropertyModel.fromJson({
      'id': 'p2',
      'address': {'city': 'Bouaké', 'latitude': 7.69, 'longitude': -5.03},
    });
    expect(p.latitude, 7.69);
    expect(p.images, isEmpty);
    expect(p.dailyPrice, 0);
    expect(p.minimumStayDays, 1);
  });

  test('toJson relu par fromJson rend la même résidence', () {
    final p = PropertyModel.fromJson(_json());
    final again = PropertyModel.fromJson(p.toJson());
    expect(again.toJson(), p.toJson());
  });
}
```

- [ ] **Step 2 : vérifier l'échec**

Run: `cd client && flutter test test/shared/money_test.dart test/features/property/property_model_test.dart`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 3 : implémenter**

`client/lib/core/api/api_endpoints.dart` :

```dart
/// Chemins de l'API, tous réunis ici : un repository ne compose pas d'URL.
abstract final class ApiEndpoints {
  /// Préfixe des routes, à reprendre dans chaque chemin déclaré ici.
  static const String v1 = '/api/v1';

  static const String login = '$v1/auth/login';
  static const String registerInit = '$v1/auth/register/init';
  static const String registerVerify = '$v1/auth/register/verify';
  static const String google = '$v1/auth/google';
  static const String refresh = '$v1/auth/refresh';
  static const String logout = '$v1/auth/logout';

  /// Résidences publiées, consultables sans compte.
  static const String properties = '$v1/client/properties';
  static const String featured = '$v1/client/properties/featured';
  static String property(String id) => '$v1/client/properties/$id';

  /// Périodes occupées, pour barrer les dates du calendrier.
  static String availability(String id) =>
      '$v1/client/properties/$id/availability';

  static String createBooking(String propertyId) =>
      '$v1/client/properties/$propertyId/bookings';

  /// Historique du client connecté, bien et état du paiement joints.
  static const String bookings = '$v1/client/bookings';

  static String waveInit(String bookingId) =>
      '$v1/client/bookings/$bookingId/payments/wave/init';

  /// Relit la session chez Wave au retour dans l'application.
  static String waveConfirm(String bookingId) =>
      '$v1/client/bookings/$bookingId/payments/wave/confirm';
}
```

`client/lib/shared/models/page_meta.dart` :

```dart
/// Pagination renvoyée par l'API (`meta`), en camelCase côté serveur.
class PageMeta {
  const PageMeta({
    required this.total,
    required this.perPage,
    required this.currentPage,
    required this.lastPage,
  });

  factory PageMeta.fromJson(Map<String, dynamic> json) => PageMeta(
    total: (json['total'] as num?)?.toInt() ?? 0,
    perPage: (json['perPage'] as num?)?.toInt() ?? 20,
    currentPage: (json['currentPage'] as num?)?.toInt() ?? 1,
    lastPage: (json['lastPage'] as num?)?.toInt() ?? 1,
  );

  final int total;
  final int perPage;
  final int currentPage;
  final int lastPage;

  bool get hasMore => currentPage < lastPage;
}

class Page<T> {
  const Page({required this.items, required this.meta});
  final List<T> items;
  final PageMeta meta;
}
```

`client/lib/shared/utils/money.dart` :

```dart
import 'package:intl/intl.dart';

/// Montant en francs CFA, sans décimale : le franc n'a pas de subdivision.
///
/// Séparateur des milliers fixé (espace fine insécable) plutôt que lu dans la
/// langue : un prix doit se lire de la même façon en français et en anglais.
String formatFcfa(int amount) {
  final digits = NumberFormat('#,##0', 'en').format(amount);
  return '${digits.replaceAll(',', ' ')} F';
}
```

`client/lib/features/property/data/models/property_model.dart` :

```dart
/// Palier de remise : à partir de [minDays] jours, [discountPercent] % de moins.
class PriceTier {
  const PriceTier({required this.minDays, required this.discountPercent});

  factory PriceTier.fromJson(Map<String, dynamic> json) => PriceTier(
    minDays: (json['min_days'] as num?)?.toInt() ?? 0,
    discountPercent: (json['discount_percent'] as num?)?.toInt() ?? 0,
  );

  final int minDays;
  final int discountPercent;

  Map<String, dynamic> toJson() => {
    'min_days': minDays,
    'discount_percent': discountPercent,
  };
}

/// Résidence publiée, telle que l'app client l'affiche.
///
/// Lecture tolérante : une résidence ancienne peut manquer de photos, de
/// coordonnées ou de paliers ; chaque champ a un repli plutôt que de lever.
class PropertyModel {
  const PropertyModel({
    required this.id,
    required this.title,
    required this.description,
    required this.propertyType,
    required this.city,
    required this.street,
    required this.latitude,
    required this.longitude,
    required this.bedrooms,
    required this.bathrooms,
    required this.surfaceArea,
    required this.amenities,
    required this.images,
    required this.dailyPrice,
    required this.priceTiers,
    required this.minimumStayDays,
    required this.maximumStayDays,
    required this.featured,
  });

  factory PropertyModel.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic> obj(Object? v) =>
        v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
    final address = obj(json['address']);
    final coords = obj(address['coordinates']);
    final details = obj(json['details']);
    final amenities = obj(json['amenities']);
    final media = obj(json['media']);
    final pricing = obj(json['pricing']);
    final visibility = obj(json['visibility']);

    // Deux formes coexistent : `address.coordinates.{latitude,longitude}`
    // (DTO d'entrée) et `address.{latitude,longitude}` (document stocké).
    double? coord(String key) =>
        ((coords[key] ?? address[key]) as num?)?.toDouble();

    return PropertyModel(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      propertyType: json['property_type'] as String? ?? 'apartment',
      city: address['city'] as String? ?? '',
      street: address['street'] as String? ?? '',
      latitude: coord('latitude'),
      longitude: coord('longitude'),
      bedrooms: (details['bedrooms'] as num?)?.toInt() ?? 0,
      bathrooms: (details['bathrooms'] as num?)?.toInt() ?? 0,
      surfaceArea: (details['surface_area'] as num?)?.toDouble(),
      amenities: {
        for (final e in amenities.entries)
          if (e.value == true) e.key,
      },
      images: ((media['images'] as List?) ?? const [])
          .whereType<String>()
          .toList(),
      dailyPrice: (pricing['daily_price'] as num?)?.round() ?? 0,
      priceTiers: ((pricing['price_tiers'] as List?) ?? const [])
          .whereType<Map>()
          .map((t) => PriceTier.fromJson(t.cast<String, dynamic>()))
          .toList(),
      minimumStayDays: (pricing['minimum_stay_days'] as num?)?.toInt() ?? 1,
      maximumStayDays: (pricing['maximum_stay_days'] as num?)?.toInt(),
      featured: visibility['featured'] == true,
    );
  }

  final String id;
  final String title;
  final String description;

  /// `apartment`, `studio`, `villa` ou `duplex`.
  final String propertyType;
  final String city;
  final String street;
  final double? latitude;
  final double? longitude;
  final int bedrooms;
  final int bathrooms;
  final double? surfaceArea;

  /// Clés d'équipement présentes (`pool`, `wifi`…).
  final Set<String> amenities;
  final List<String> images;
  final int dailyPrice;
  final List<PriceTier> priceTiers;
  final int minimumStayDays;
  final int? maximumStayDays;

  /// Mise en avant (« À la une »).
  final bool featured;

  bool get hasLocation => latitude != null && longitude != null;

  /// Même forme que l'API : un favori relu hors réseau passe par [fromJson].
  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'description': description,
    'property_type': propertyType,
    'address': {
      'street': street,
      'city': city,
      'coordinates': {'latitude': latitude, 'longitude': longitude},
    },
    'details': {
      'bedrooms': bedrooms,
      'bathrooms': bathrooms,
      'surface_area': surfaceArea,
    },
    'amenities': {for (final a in amenities) a: true},
    'media': {'images': images},
    'pricing': {
      'daily_price': dailyPrice,
      'price_tiers': priceTiers.map((t) => t.toJson()).toList(),
      'minimum_stay_days': minimumStayDays,
      'maximum_stay_days': maximumStayDays,
    },
    'visibility': {'featured': featured},
  };
}
```

- [ ] **Step 4 : vérifier**

Run: `cd client && flutter test test/shared/money_test.dart test/features/property/property_model_test.dart`
Expected: PASS (4 tests). Si `formatFcfa` diffère d'un caractère, comparer les points de code — le test attend ` `.

- [ ] **Step 5 : commit (sur demande)**

```bash
git add lib/core/api/api_endpoints.dart lib/shared lib/features/property test/shared test/features/property
git commit -m "feat(property): modele de residence, pagination et montants"
```

---

### Task 2 : prix d'un séjour et occupation des dates

**Files:**
- Create: `client/lib/features/booking/domain/stay_price.dart`
- Create: `client/lib/features/booking/domain/occupancy.dart`
- Test: `client/test/features/booking/stay_price_test.dart`, `client/test/features/booking/occupancy_test.dart`

**Interfaces:**
- Consumes: `PriceTier` (Task 1).
- Produces:
  - `int countStayDays(DateTime start, DateTime end)`
  - `int resolveDiscountPercent(int days, List<PriceTier> tiers)`
  - `class StayPrice { int days, dailyPrice, discountPercent, subtotal; int get discountAmount }`
  - `enum StayPriceError { invalidDates, minimumStay, maximumStay }`, `class StayPriceException implements Exception { StayPriceError error; int? limit }`
  - `StayPrice calculateStayPrice({required int dailyPrice, required List<PriceTier> tiers, required int minimumStayDays, int? maximumStayDays, required DateTime start, required DateTime end})`
  - `class OccupiedPeriod { DateTime start, end; factory fromJson }`, `DateTime dayOf(DateTime)`, `Set<DateTime> occupiedDays(List<OccupiedPeriod>)`, `bool isRangeFree(DateTime start, DateTime end, Set<DateTime> occupied)`.

- [ ] **Step 1 : écrire les tests qui échouent**

`client/test/features/booking/stay_price_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/features/booking/domain/stay_price.dart';
import 'package:resi_client/features/property/data/models/property_model.dart';

DateTime d(int day) => DateTime.utc(2026, 10, day);

void main() {
  group('countStayDays (miroir de l’API)', () {
    test('du 10 au 12 : 2 jours', () => expect(countStayDays(d(10), d(12)), 2));
    test('même jour : 0', () => expect(countStayDays(d(10), d(10)), 0));
  });

  group('resolveDiscountPercent', () {
    const tiers = [
      PriceTier(minDays: 7, discountPercent: 10),
      PriceTier(minDays: 3, discountPercent: 5),
    ];
    test('palier le plus avantageux atteint, quel que soit l’ordre', () {
      expect(resolveDiscountPercent(2, tiers), 0);
      expect(resolveDiscountPercent(3, tiers), 5);
      expect(resolveDiscountPercent(10, tiers), 10);
    });
    test('plafonné à 100', () {
      expect(
        resolveDiscountPercent(1, const [PriceTier(minDays: 1, discountPercent: 150)]),
        100,
      );
    });
  });

  group('calculateStayPrice', () {
    StayPrice price(DateTime s, DateTime e, {int min = 1, int? max}) =>
        calculateStayPrice(
          dailyPrice: 33333,
          tiers: const [PriceTier(minDays: 3, discountPercent: 10)],
          minimumStayDays: min,
          maximumStayDays: max,
          start: s,
          end: e,
        );

    test('arrondi au franc après remise', () {
      final p = price(d(10), d(13));
      expect(p.days, 3);
      expect(p.discountPercent, 10);
      expect(p.subtotal, 89999); // round(99999 × 0,9) = round(89999,1)
      expect(p.discountAmount, 10000);
    });

    test('dates inversées', () {
      expect(
        () => price(d(12), d(10)),
        throwsA(isA<StayPriceException>().having((e) => e.error, 'error', StayPriceError.invalidDates)),
      );
    });

    test('séjour minimum non atteint', () {
      expect(
        () => price(d(10), d(11), min: 2),
        throwsA(isA<StayPriceException>()
            .having((e) => e.error, 'error', StayPriceError.minimumStay)
            .having((e) => e.limit, 'limit', 2)),
      );
    });

    test('séjour maximum dépassé', () {
      expect(
        () => price(d(10), d(20), max: 5),
        throwsA(isA<StayPriceException>().having((e) => e.error, 'error', StayPriceError.maximumStay)),
      );
    });
  });
}
```

`client/test/features/booking/occupancy_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/features/booking/domain/occupancy.dart';

DateTime d(int day) => DateTime.utc(2026, 10, day);

void main() {
  final periods = [
    OccupiedPeriod.fromJson({
      'start': '2026-10-10T12:00:00.000Z',
      'end': '2026-10-12T12:00:00.000Z',
    }),
  ];

  test('jours occupés : arrivée incluse, jour de sortie libre', () {
    expect(occupiedDays(periods), {d(10), d(11)});
  });

  test('une plage qui finit le jour d’arrivée d’un autre séjour est libre', () {
    expect(isRangeFree(d(8), d(10), occupiedDays(periods)), isTrue);
  });

  test('une plage qui commence le jour de sortie est libre', () {
    expect(isRangeFree(d(12), d(14), occupiedDays(periods)), isTrue);
  });

  test('une plage qui traverse un séjour est prise', () {
    expect(isRangeFree(d(9), d(13), occupiedDays(periods)), isFalse);
  });
}
```

- [ ] **Step 2 : vérifier l'échec**

Run: `cd client && flutter test test/features/booking/`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 3 : implémenter**

`client/lib/features/booking/domain/stay_price.dart` :

```dart
import '../../property/data/models/property_model.dart';

/// Recopie de `api/app/features/bookings/stay_pricing.ts`.
///
/// L'estimation affichée doit tomber sur le montant que le serveur facturera :
/// toute divergence se voit au moment de payer. Une règle changée côté API se
/// reporte ici, tests compris.
const _millisecondsPerDay = 1000 * 60 * 60 * 24;

/// Jours d'occupation (12h → 12h le lendemain = 1 jour), jour entamé compté.
int countStayDays(DateTime start, DateTime end) =>
    ((end.millisecondsSinceEpoch - start.millisecondsSinceEpoch) /
            _millisecondsPerDay)
        .ceil();

/// Remise du palier le plus avantageux atteint, bornée à [0, 100].
int resolveDiscountPercent(int days, List<PriceTier> tiers) {
  var best = 0;
  for (final tier in tiers) {
    if (days >= tier.minDays && tier.discountPercent > best) {
      best = tier.discountPercent;
    }
  }
  return best.clamp(0, 100);
}

enum StayPriceError { invalidDates, minimumStay, maximumStay }

class StayPriceException implements Exception {
  const StayPriceException(this.error, {this.limit});
  final StayPriceError error;

  /// Borne franchie, en jours, pour [StayPriceError.minimumStay] et
  /// [StayPriceError.maximumStay].
  final int? limit;
}

class StayPrice {
  const StayPrice({
    required this.days,
    required this.dailyPrice,
    required this.discountPercent,
    required this.subtotal,
  });

  final int days;
  final int dailyPrice;
  final int discountPercent;

  /// Montant après remise de durée, avant code promo.
  final int subtotal;

  int get discountAmount => days * dailyPrice - subtotal;
}

StayPrice calculateStayPrice({
  required int dailyPrice,
  required List<PriceTier> tiers,
  required int minimumStayDays,
  int? maximumStayDays,
  required DateTime start,
  required DateTime end,
}) {
  final days = countStayDays(start, end);
  if (days < 1) throw const StayPriceException(StayPriceError.invalidDates);
  if (days < minimumStayDays) {
    throw StayPriceException(StayPriceError.minimumStay, limit: minimumStayDays);
  }
  if (maximumStayDays != null && days > maximumStayDays) {
    throw StayPriceException(StayPriceError.maximumStay, limit: maximumStayDays);
  }

  final discountPercent = resolveDiscountPercent(days, tiers);
  // Arrondi au franc, comme le serveur : un sous-total à virgule se
  // propagerait jusqu'au montant encaissé.
  final subtotal = (days * dailyPrice * (1 - discountPercent / 100)).round();
  return StayPrice(
    days: days,
    dailyPrice: dailyPrice,
    discountPercent: discountPercent,
    subtotal: subtotal,
  );
}
```

`client/lib/features/booking/domain/occupancy.dart` :

```dart
/// Période occupée d'une résidence (`GET …/availability`).
class OccupiedPeriod {
  const OccupiedPeriod({required this.start, required this.end});

  factory OccupiedPeriod.fromJson(Map<String, dynamic> json) => OccupiedPeriod(
    start: DateTime.parse(json['start'] as String),
    end: DateTime.parse(json['end'] as String),
  );

  final DateTime start;
  final DateTime end;
}

/// Jour calendaire d'un instant, dans le fuseau du téléphone.
///
/// En UTC : sans heure d'été en Côte d'Ivoire, mais un `DateTime` local
/// comparé à un `DateTime` UTC ne serait jamais égal dans un `Set`.
DateTime dayOf(DateTime instant) {
  final local = instant.toLocal();
  return DateTime.utc(local.year, local.month, local.day);
}

/// Jours où la résidence est occupée : de l'arrivée incluse à la sortie
/// exclue. Le jour de sortie reste réservable — règle 12h → 12h, un séjour
/// peut commencer le jour où un autre finit.
Set<DateTime> occupiedDays(List<OccupiedPeriod> periods) {
  final days = <DateTime>{};
  for (final period in periods) {
    final last = dayOf(period.end);
    for (var day = dayOf(period.start);
        day.isBefore(last);
        day = day.add(const Duration(days: 1))) {
      days.add(day);
    }
  }
  return days;
}

/// La plage [start, end[ ne touche-t-elle aucun jour occupé ?
bool isRangeFree(DateTime start, DateTime end, Set<DateTime> occupied) {
  for (var day = dayOf(start);
      day.isBefore(dayOf(end));
      day = day.add(const Duration(days: 1))) {
    if (occupied.contains(day)) return false;
  }
  return true;
}
```

- [ ] **Step 4 : vérifier**

Run: `cd client && flutter test test/features/booking/`
Expected: PASS (11 tests).

- [ ] **Step 5 : commit (sur demande)**

```bash
git add lib/features/booking/domain test/features/booking
git commit -m "feat(booking): prix d'un sejour et jours occupes, miroir de l'api"
```

---

### Task 3 : session, jetons et intercepteur d'authentification

**Files:**
- Modify: `client/pubspec.yaml` (flutter_secure_storage)
- Create: `client/lib/core/auth/auth_user.dart`
- Create: `client/lib/core/auth/token_store.dart`
- Create: `client/lib/core/auth/session_controller.dart`
- Create: `client/lib/core/api/interceptors/auth_interceptor.dart`
- Modify: `client/lib/core/api/api_client.dart`, `client/lib/core/di/service_locator.dart`, `client/lib/core/bootstrap.dart`
- Modify: `client/lib/core/error/failures.dart` (ajout `AppFailure.localized`)
- Test: `client/test/core/auth/auth_interceptor_test.dart`

**Interfaces:**
- Produces:
  - `class AuthUser { String id, fullName, role; String? email, phone, avatarUrl; fromJson/toJson }`
  - `class AuthTokens { String accessToken, refreshToken; AuthUser user; fromJson }`
  - `class TokenStore { Future<String?> get accessToken; Future<String?> get refreshToken; Future<AuthUser?> readUser(); Future<void> save(AuthTokens); Future<void> saveTokens({required String access, required String refresh}); Future<void> clear() }`
  - `class SessionController extends ValueNotifier<AuthUser?> { bool get isSignedIn; Future<void> restore(); Future<void> open(AuthTokens); Future<void> close() }`
  - `class AuthInterceptor extends Interceptor` ; `const skipAuthRefresh = 'skip_auth_refresh'` (clé d'`extra`).
  - `factory AppFailure.localized({required String message, int? statusCode, String? code})`.

- [ ] **Step 1 : dépendance**

Dans `client/pubspec.yaml`, sous `dependencies` :

```yaml
  # Jetons de session chiffrés (Keystore / Keychain) : un jeton en
  # SharedPreferences se lirait sur un téléphone rooté.
  flutter_secure_storage: ^10.3.1
```

Run: `cd client && flutter pub get`

- [ ] **Step 2 : écrire le test qui échoue**

`client/test/core/auth/auth_interceptor_test.dart` :

```dart
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/api/interceptors/auth_interceptor.dart';
import 'package:resi_client/core/auth/session_controller.dart';
import 'package:resi_client/core/auth/token_store.dart';

/// Adaptateur scripté : répond selon le chemin et le jeton reçu.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);
  final ResponseBody Function(RequestOptions) handler;
  final calls = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? _, Future<void>? __) async {
    calls.add(o);
    return handler(o);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) => ResponseBody.fromString(
  jsonEncode(body),
  status,
  headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
);

const _user = {'id': 'u1', 'full_name': 'Awa', 'role': 'client'};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late TokenStore store;
  late SessionController session;

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    store = TokenStore(const FlutterSecureStorage());
    session = SessionController(store);
    await store.saveTokens(access: 'old', refresh: 'r1');
  });

  Dio dio(_Adapter api, _Adapter refresh) {
    final d = Dio(BaseOptions(baseUrl: 'http://api'))..httpClientAdapter = api;
    d.interceptors.add(AuthInterceptor(store, session, refreshClient: (base) {
      return Dio(BaseOptions(baseUrl: base))..httpClientAdapter = refresh;
    }));
    return d;
  }

  test('401 : rafraîchit puis rejoue avec le nouveau jeton', () async {
    final api = _Adapter((o) => o.headers['Authorization'] == 'Bearer new'
        ? _json(200, {'ok': true})
        : _json(401, {}));
    final refresh = _Adapter((o) => o.path.endsWith('/auth/refresh')
        ? _json(200, {'access_token': 'new', 'refresh_token': 'r2', 'user': _user})
        : _json(200, {'ok': true}));

    final res = await dio(api, refresh).get('/client/bookings');

    expect(res.statusCode, 200);
    expect(await store.accessToken, 'new');
    expect(await store.refreshToken, 'r2');
  });

  test('refresh refusé : session fermée', () async {
    final api = _Adapter((_) => _json(401, {}));
    final refresh = _Adapter((_) => _json(401, {}));

    await expectLater(dio(api, refresh).get('/client/bookings'), throwsA(isA<DioException>()));
    expect(await store.accessToken, isNull);
    expect(session.value, isNull);
  });

  test('requête marquée skip_auth_refresh : pas de rafraîchissement', () async {
    final api = _Adapter((_) => _json(401, {}));
    final refresh = _Adapter((_) => _json(200, {}));

    await expectLater(
      dio(api, refresh).post('/auth/login', options: Options(extra: {skipAuthRefresh: true})),
      throwsA(isA<DioException>()),
    );
    expect(refresh.calls, isEmpty);
    expect(await store.refreshToken, 'r1');
  });
}
```

- [ ] **Step 3 : vérifier l'échec**

Run: `cd client && flutter test test/core/auth/auth_interceptor_test.dart`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 4 : implémenter**

`client/lib/core/auth/auth_user.dart` :

```dart
/// Compte connecté, tel que l'API le rend dans `user`.
class AuthUser {
  const AuthUser({
    required this.id,
    required this.fullName,
    required this.role,
    this.email,
    this.phone,
    this.avatarUrl,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
    id: json['id'] as String,
    fullName: json['full_name'] as String? ?? '',
    role: json['role'] as String? ?? '',
    email: json['email'] as String?,
    phone: json['phone'] as String?,
    avatarUrl: json['avatar_url'] as String?,
  );

  final String id;
  final String fullName;
  final String role;
  final String? email;
  final String? phone;
  final String? avatarUrl;

  Map<String, dynamic> toJson() => {
    'id': id,
    'full_name': fullName,
    'role': role,
    'email': email,
    'phone': phone,
    'avatar_url': avatarUrl,
  };
}

/// Réponse des routes de connexion : jetons et compte.
class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
    accessToken: json['access_token'] as String,
    refreshToken: json['refresh_token'] as String,
    user: AuthUser.fromJson((json['user'] as Map).cast<String, dynamic>()),
  );

  final String accessToken;
  final String refreshToken;
  final AuthUser user;
}
```

`client/lib/core/auth/token_store.dart` :

```dart
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_user.dart';

/// Jetons et compte connecté, chiffrés par le système.
///
/// Le compte est gardé avec les jetons : le tiroir affiche le nom au
/// démarrage sans attendre l'API.
class TokenStore {
  const TokenStore(this._storage);
  final FlutterSecureStorage _storage;

  static const _access = 'access_token';
  static const _refresh = 'refresh_token';
  static const _user = 'user';

  Future<String?> get accessToken => _storage.read(key: _access);
  Future<String?> get refreshToken => _storage.read(key: _refresh);

  Future<AuthUser?> readUser() async {
    final raw = await _storage.read(key: _user);
    if (raw == null) return null;
    try {
      return AuthUser.fromJson((jsonDecode(raw) as Map).cast<String, dynamic>());
    } catch (_) {
      // Compte illisible (format d'une version antérieure) : on le traite
      // comme absent, la prochaine connexion le réécrit.
      return null;
    }
  }

  Future<void> save(AuthTokens tokens) => Future.wait([
    saveTokens(access: tokens.accessToken, refresh: tokens.refreshToken),
    _storage.write(key: _user, value: jsonEncode(tokens.user.toJson())),
  ]);

  Future<void> saveTokens({required String access, required String refresh}) =>
      Future.wait([
        _storage.write(key: _access, value: access),
        _storage.write(key: _refresh, value: refresh),
      ]);

  Future<void> clear() => Future.wait([
    _storage.delete(key: _access),
    _storage.delete(key: _refresh),
    _storage.delete(key: _user),
  ]);
}
```

`client/lib/core/auth/session_controller.dart` :

```dart
import 'package:flutter/foundation.dart';

import 'auth_user.dart';
import 'token_store.dart';

/// Compte connecté, écouté par le tiroir et les gardes de navigation.
class SessionController extends ValueNotifier<AuthUser?> {
  SessionController(this._store) : super(null);
  final TokenStore _store;

  bool get isSignedIn => value != null;

  /// Relit la session au démarrage. Sans jeton, le compte gardé ne vaut rien.
  Future<void> restore() async {
    if (await _store.accessToken == null) return;
    value = await _store.readUser();
  }

  Future<void> open(AuthTokens tokens) async {
    await _store.save(tokens);
    value = tokens.user;
  }

  Future<void> close() async {
    await _store.clear();
    value = null;
  }
}
```

`client/lib/core/api/interceptors/auth_interceptor.dart` :

```dart
import 'package:dio/dio.dart';

import '../../auth/session_controller.dart';
import '../../auth/token_store.dart';
import '../../error/failures.dart';
import '../api_endpoints.dart';

/// Clé d'`extra` : la requête ne déclenche pas de rafraîchissement sur 401.
///
/// Posée sur la connexion et l'inscription : un 401 y signifie « identifiants
/// refusés », et rafraîchir une ancienne session rejouerait la connexion.
const skipAuthRefresh = 'skip_auth_refresh';

/// Jeton sur chaque requête ; rafraîchissement unique et mutualisé sur 401.
///
/// Repris de l'application propriétaire. L'API fait tourner le refresh token
/// (usage unique) : deux rafraîchissements concurrents se révoqueraient l'un
/// l'autre, d'où la file d'attente.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(
    this._store,
    this._session, {
    Dio Function(String baseUrl)? refreshClient,
  }) : _refreshClient =
           refreshClient ?? ((baseUrl) => Dio(BaseOptions(baseUrl: baseUrl)));

  final TokenStore _store;
  final SessionController _session;

  /// Client sans intercepteur : un 401 sur `/auth/refresh` ne doit pas
  /// relancer un rafraîchissement.
  final Dio Function(String baseUrl) _refreshClient;

  bool _isRefreshing = false;
  final _queue = <({RequestOptions options, ErrorInterceptorHandler handler})>[];

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _store.accessToken;
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401 ||
        err.requestOptions.extra[skipAuthRefresh] == true) {
      handler.next(err);
      return;
    }

    if (_isRefreshing) {
      _queue.add((options: err.requestOptions, handler: handler));
      return;
    }
    _isRefreshing = true;

    try {
      final refresh = await _store.refreshToken;
      if (refresh == null) {
        await _session.close();
        _rejectQueue(err);
        handler.next(err);
        return;
      }

      final fresh = _refreshClient(err.requestOptions.baseUrl);
      final res = await fresh.post(
        ApiEndpoints.refresh,
        data: {'refresh_token': refresh},
      );
      final access = res.data['access_token'] as String;
      final nextRefresh = res.data['refresh_token'] as String? ?? refresh;
      await _store.saveTokens(access: access, refresh: nextRefresh);

      err.requestOptions.headers['Authorization'] = 'Bearer $access';
      handler.resolve(await fresh.fetch(err.requestOptions));
      for (final pending in _queue) {
        pending.options.headers['Authorization'] = 'Bearer $access';
        pending.handler.resolve(await fresh.fetch(pending.options));
      }
    } catch (e) {
      // Seul un refus du serveur clôt la session : une coupure pendant le
      // rafraîchissement ne doit pas déconnecter un jeton encore valide.
      if (e is DioException && e.response != null) {
        await _session.close();
        _rejectQueue(err);
        handler.next(err);
      } else {
        final offline = DioException(
          requestOptions: err.requestOptions,
          type: DioExceptionType.connectionError,
          error: AppFailure.noInternet(),
        );
        _rejectQueue(offline);
        handler.next(offline);
      }
    } finally {
      _isRefreshing = false;
      _queue.clear();
    }
  }

  /// Vidée sans réponse, la file laisserait ses écrans attendre sans fin.
  void _rejectQueue(DioException err) {
    for (final pending in _queue) {
      pending.handler.next(err.copyWith(requestOptions: pending.options));
    }
  }
}
```

`client/lib/core/error/failures.dart` — ajouter avant `factory AppFailure.unexpected` :

```dart
  /// Refus dont le message est déjà rédigé dans la langue de l'application.
  factory AppFailure.localized({
    required String message,
    int? statusCode,
    String? code,
  }) => AppFailure._(
    userMessage: message,
    debugMessage: 'HTTP $statusCode - $code',
    statusCode: statusCode,
    code: code,
  );
```

`client/lib/core/api/api_client.dart` — signature et ordre des intercepteurs :

```dart
Dio buildDioClient(
  AppConfig config,
  ConnectivityInterceptor connectivity,
  AuthInterceptor auth,
  RetryInterceptor retry,
) {
```

```dart
  dio.interceptors.addAll([
    connectivity,
    auth,
    retry,
    if (kDebugMode && config.enableLogging) const RedactingLogInterceptor(),
  ]);
```

(ajouter `import 'interceptors/auth_interceptor.dart';`).

`client/lib/core/di/service_locator.dart` — sous `// ── Core` :

```dart
  sl.registerSingleton<TokenStore>(
    const TokenStore(
      FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true)),
    ),
  );
  sl.registerSingleton<SessionController>(SessionController(sl()));
```

et sous `// ── Network`, remplacer l'enregistrement de Dio :

```dart
  sl.registerSingleton<AuthInterceptor>(AuthInterceptor(sl(), sl()));
  sl.registerSingleton<Dio>(buildDioClient(config, sl(), sl(), sl()));
```

(imports : `flutter_secure_storage`, `../auth/token_store.dart`, `../auth/session_controller.dart`, `../api/interceptors/auth_interceptor.dart`).

`client/lib/core/bootstrap.dart` — après `await setupServiceLocator(config);` :

```dart
  // Avant le premier écran : le tiroir et les gardes lisent la session.
  await sl<SessionController>().restore();
```

- [ ] **Step 5 : vérifier**

Run: `cd client && flutter test test/core/auth/auth_interceptor_test.dart && flutter analyze`
Expected: PASS (3 tests), aucun problème d'analyse.

- [ ] **Step 6 : commit (sur demande)**

```bash
git add pubspec.yaml pubspec.lock lib/core test/core/auth
git commit -m "feat(auth): session, jetons chiffres et rafraichissement mutualise"
```

---

### Task 4 : connexion, inscription, Google

**Files:**
- Modify: `client/pubspec.yaml` (google_sign_in)
- Modify: `client/lib/core/config/app_config.dart` (`googleServerClientId`)
- Create: `client/lib/features/auth/data/repositories/auth_repository.dart`
- Create: `client/lib/features/auth/data/services/google_auth_service.dart`
- Create: `client/lib/features/auth/data/services/auth_service.dart`
- Create: `client/lib/features/auth/business_logic/auth_cubit.dart`, `auth_state.dart`
- Create: `client/lib/features/auth/presentation/screens/login_screen.dart`, `register_screen.dart`, `otp_screen.dart`
- Modify: `client/lib/core/router/app_router.dart`, `client/lib/core/di/service_locator.dart`
- Modify: `client/assets/translations/fr.json`, `en.json`
- Test: `client/test/features/auth/auth_service_test.dart`, `client/test/features/auth/auth_cubit_test.dart`

**Interfaces:**
- Consumes: `AuthTokens`, `TokenStore`, `SessionController`, `skipAuthRefresh`, `AppFailure.localized` (Task 3).
- Produces:
  - `class RegisterStart { String target; String? devCode }`
  - `AuthRepository`: `login(String identifier, String password)`, `registerInit({required String fullName, required String channel, required String contact, required String password})`, `registerVerify({required String channel, required String target, required String code})`, `google(String idToken)` → `Future<AuthTokens>` / `Future<RegisterStart>` ; `logout(String refreshToken, {String? accessToken})`.
  - `abstract class GoogleIdTokenProvider { Future<String> obtainIdToken(); }`, `class GoogleSignInCancelled implements Exception`.
  - `AuthService`: `login`, `startRegistration`, `verify`, `signInWithGoogle`, `logout`, `bool get googleEnabled`.
  - `AuthCubit` / `AuthState` : `AuthInitial`, `AuthSubmitting`, `AuthOtpRequired(RegisterStart start, String channel)`, `AuthSucceeded`, `AuthError(String message)`.
  - Routes `LoginRoute` (pop `true` si connecté), `RegisterRoute`, `OtpRoute({required String channel, required RegisterStart start})`.

- [ ] **Step 1 : dépendance et configuration**

`pubspec.yaml` :

```yaml
  # Connexion en un geste ; l'API vérifie l'ID token Google et crée le
  # compte client (`role_name: client`).
  google_sign_in: ^6.3.0
```

`app_config.dart`, dans `AppConfig` :

```dart
  /// Client OAuth « Web » du projet Firebase : sans lui, Android ne rend pas
  /// d'ID token. Vide : le bouton Google est masqué.
  static const String googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );
```

Run: `cd client && flutter pub get`

- [ ] **Step 2 : clés de traduction**

Ajouter à `fr.json` :

```json
"auth": {
  "login_title": "Connexion",
  "login_subtitle": "Connectez-vous pour réserver.",
  "identifier": "Téléphone ou e-mail",
  "password": "Mot de passe",
  "password_confirm": "Confirmer le mot de passe",
  "submit_login": "Se connecter",
  "google": "Continuer avec Google",
  "no_account": "Pas encore de compte ? Créer un compte",
  "register_title": "Créer un compte",
  "full_name": "Nom complet",
  "channel_phone": "Téléphone",
  "channel_email": "E-mail",
  "phone": "Numéro de téléphone",
  "email": "Adresse e-mail",
  "submit_register": "Recevoir le code",
  "otp_title": "Code de vérification",
  "otp_subtitle": "Saisissez le code envoyé à {target}.",
  "otp_dev": "Code de développement : {code}",
  "submit_otp": "Valider",
  "wrong_role": "Ce compte n'est pas un compte client. Utilisez l'application propriétaire.",
  "password_mismatch": "Les mots de passe ne correspondent pas.",
  "required": "Champ requis."
}
```

et à `en.json` :

```json
"auth": {
  "login_title": "Sign in",
  "login_subtitle": "Sign in to book.",
  "identifier": "Phone or email",
  "password": "Password",
  "password_confirm": "Confirm password",
  "submit_login": "Sign in",
  "google": "Continue with Google",
  "no_account": "No account yet? Create one",
  "register_title": "Create an account",
  "full_name": "Full name",
  "channel_phone": "Phone",
  "channel_email": "Email",
  "phone": "Phone number",
  "email": "Email address",
  "submit_register": "Get the code",
  "otp_title": "Verification code",
  "otp_subtitle": "Enter the code sent to {target}.",
  "otp_dev": "Development code: {code}",
  "submit_otp": "Confirm",
  "wrong_role": "This is not a guest account. Use the owner app.",
  "password_mismatch": "Passwords do not match.",
  "required": "Required."
}
```

- [ ] **Step 3 : écrire les tests qui échouent**

`client/test/features/auth/auth_service_test.dart` :

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/auth/auth_user.dart';
import 'package:resi_client/core/auth/session_controller.dart';
import 'package:resi_client/core/auth/token_store.dart';
import 'package:resi_client/core/error/failures.dart';
import 'package:resi_client/features/auth/data/repositories/auth_repository.dart';
import 'package:resi_client/features/auth/data/services/auth_service.dart';

class _Repo implements AuthRepository {
  _Repo(this.role);
  final String role;
  final revoked = <String>[];

  AuthTokens _tokens() => AuthTokens(
    accessToken: 'a',
    refreshToken: 'r',
    user: AuthUser(id: 'u1', fullName: 'Awa', role: role),
  );

  @override
  Future<AuthTokens> login(String identifier, String password) async => _tokens();

  @override
  Future<void> logout(String refreshToken, {String? accessToken}) async =>
      revoked.add(refreshToken);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SessionController session;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    session = SessionController(const TokenStore(FlutterSecureStorage()));
  });

  test('un compte client ouvre la session', () async {
    final service = AuthService(_Repo('client'), session, const TokenStore(FlutterSecureStorage()));
    await service.login('awa@example.com', 'secret123');
    expect(session.value?.id, 'u1');
  });

  test('un compte propriétaire est refusé et sa session révoquée', () async {
    final repo = _Repo('proprio');
    final service = AuthService(repo, session, const TokenStore(FlutterSecureStorage()));

    await expectLater(
      service.login('owner@example.com', 'secret123'),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'wrong_role')),
    );
    expect(session.value, isNull);
    expect(repo.revoked, ['r']);
  });
}
```

`client/test/features/auth/auth_cubit_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/error/failures.dart';
import 'package:resi_client/features/auth/business_logic/auth_cubit.dart';
import 'package:resi_client/features/auth/business_logic/auth_state.dart';
import 'package:resi_client/features/auth/data/repositories/auth_repository.dart';
import 'package:resi_client/features/auth/data/services/auth_service.dart';

class _Service implements AuthService {
  _Service({this.fail});
  final AppFailure? fail;

  @override
  Future<void> login(String identifier, String password) async {
    if (fail != null) throw fail!;
  }

  @override
  Future<RegisterStart> startRegistration({
    required String fullName,
    required String channel,
    required String contact,
    required String password,
  }) async => const RegisterStart(target: '+2250700000000', devCode: '123456');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('connexion réussie', () async {
    final cubit = AuthCubit(_Service());
    final states = <AuthState>[];
    final sub = cubit.stream.listen(states.add);
    await cubit.login('a@b.ci', 'secret123');
    await sub.cancel();
    expect(states, [isA<AuthSubmitting>(), isA<AuthSucceeded>()]);
  });

  test('connexion refusée : message affichable', () async {
    final cubit = AuthCubit(_Service(fail: AppFailure.localized(message: 'Refusé', code: 'x')));
    await cubit.login('a@b.ci', 'bad');
    expect(cubit.state, isA<AuthError>().having((s) => s.message, 'message', 'Refusé'));
  });

  test('inscription : code demandé', () async {
    final cubit = AuthCubit(_Service());
    await cubit.startRegistration(
      fullName: 'Awa Koné',
      channel: 'phone',
      contact: '+2250700000000',
      password: 'secret123',
    );
    expect(cubit.state, isA<AuthOtpRequired>().having((s) => s.start.devCode, 'devCode', '123456'));
  });
}
```

- [ ] **Step 4 : vérifier l'échec**

Run: `cd client && flutter test test/features/auth/`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 5 : implémenter les données et la logique**

`client/lib/features/auth/data/repositories/auth_repository.dart` :

```dart
import 'package:dio/dio.dart';

import '../../../../core/api/api_endpoints.dart';
import '../../../../core/api/interceptors/auth_interceptor.dart';
import '../../../../core/auth/auth_user.dart';
import '../../../../core/error/failures.dart';

/// Début d'inscription : le code part vers [target].
class RegisterStart {
  const RegisterStart({required this.target, this.devCode});

  final String target;

  /// Code renvoyé par l'API hors production, pour tester sans SMS.
  final String? devCode;
}

class AuthRepository {
  AuthRepository(this._dio);
  final Dio _dio;

  /// Un 401 ici veut dire « identifiants refusés » : pas de rafraîchissement.
  static final _public = Options(extra: {skipAuthRefresh: true});

  Future<AuthTokens> login(String identifier, String password) => _tokens(
    () => _dio.post(
      ApiEndpoints.login,
      data: {'identifier': identifier, 'password': password},
      options: _public,
    ),
  );

  /// [channel] : `phone` ou `email` ; [contact] : le numéro ou l'adresse.
  Future<RegisterStart> registerInit({
    required String fullName,
    required String channel,
    required String contact,
    required String password,
  }) async {
    try {
      final res = await _dio.post(
        ApiEndpoints.registerInit,
        data: {
          'full_name': fullName,
          'auth_channel': channel,
          channel: contact,
          'password': password,
          'password_confirmation': password,
          'role_name': 'client',
        },
        options: _public,
      );
      final data = (res.data as Map).cast<String, dynamic>();
      return RegisterStart(
        target: data['target'] as String? ?? contact,
        devCode: data['dev_otp_code'] as String?,
      );
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }

  Future<AuthTokens> registerVerify({
    required String channel,
    required String target,
    required String code,
  }) => _tokens(
    () => _dio.post(
      ApiEndpoints.registerVerify,
      data: {'channel': channel, 'target': target, 'code': code},
      options: _public,
    ),
  );

  /// `role_name: client` : lu seulement si le compte naît à cette connexion.
  Future<AuthTokens> google(String idToken) => _tokens(
    () => _dio.post(
      ApiEndpoints.google,
      data: {'id_token': idToken, 'role_name': 'client'},
      options: _public,
    ),
  );

  /// [accessToken] : pour révoquer une session pas encore enregistrée.
  Future<void> logout(String refreshToken, {String? accessToken}) async {
    try {
      await _dio.post(
        ApiEndpoints.logout,
        data: {'refresh_token': refreshToken},
        options: Options(
          headers: {if (accessToken != null) 'Authorization': 'Bearer $accessToken'},
          extra: {skipAuthRefresh: true},
        ),
      );
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }

  Future<AuthTokens> _tokens(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      return AuthTokens.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }
}
```

`client/lib/features/auth/data/services/google_auth_service.dart` :

```dart
import 'package:google_sign_in/google_sign_in.dart';

import '../../../../core/error/failures.dart';

/// L'utilisateur a fermé le sélecteur Google : pas une erreur à afficher.
class GoogleSignInCancelled implements Exception {
  const GoogleSignInCancelled();
}

abstract class GoogleIdTokenProvider {
  Future<String> obtainIdToken();
}

/// Obtient un **ID token** Google, que l'API vérifie. L'access token n'est
/// jamais utilisé : il ne prouve pas l'identité.
class GoogleAuthService implements GoogleIdTokenProvider {
  GoogleAuthService(this._googleSignIn);
  final GoogleSignIn _googleSignIn;

  @override
  Future<String> obtainIdToken() async {
    // Sans déconnexion préalable, le SDK reprend le dernier compte et
    // l'utilisateur ne peut plus en changer.
    await _googleSignIn.signOut();
    final account = await _googleSignIn.signIn();
    if (account == null) throw const GoogleSignInCancelled();
    final idToken = (await account.authentication).idToken;
    if (idToken == null || idToken.isEmpty) {
      throw AppFailure.unexpected(message: 'id_token Google absent');
    }
    return idToken;
  }
}
```

`client/lib/features/auth/data/services/auth_service.dart` :

```dart
import 'package:easy_localization/easy_localization.dart';

import '../../../../core/auth/auth_user.dart';
import '../../../../core/auth/session_controller.dart';
import '../../../../core/auth/token_store.dart';
import '../../../../core/error/failures.dart';
import '../repositories/auth_repository.dart';
import 'google_auth_service.dart';

class AuthService {
  AuthService(this._repo, this._session, this._store, {this.google});

  final AuthRepository _repo;
  final SessionController _session;
  final TokenStore _store;

  /// `null` quand Google n'est pas configuré pour ce build.
  final GoogleIdTokenProvider? google;

  bool get googleEnabled => google != null;

  Future<void> login(String identifier, String password) async =>
      _open(await _repo.login(identifier, password));

  Future<RegisterStart> startRegistration({
    required String fullName,
    required String channel,
    required String contact,
    required String password,
  }) => _repo.registerInit(
    fullName: fullName,
    channel: channel,
    contact: contact,
    password: password,
  );

  Future<void> verify({
    required String channel,
    required String target,
    required String code,
  }) async =>
      _open(await _repo.registerVerify(channel: channel, target: target, code: code));

  Future<void> signInWithGoogle() async =>
      _open(await _repo.google(await google!.obtainIdToken()));

  Future<void> logout() async {
    final refresh = await _store.refreshToken;
    if (refresh != null) {
      try {
        await _repo.logout(refresh);
      } on AppFailure {
        // La session locale se ferme quoi qu'il arrive : un serveur
        // injoignable ne doit pas retenir l'utilisateur connecté.
      }
    }
    await _session.close();
  }

  /// Un compte propriétaire ou gérant n'a rien à faire ici : ses routes de
  /// réservation client lui rendraient 403 à chaque appel. Sa session tout
  /// juste ouverte est révoquée aussitôt, comme le fait le backoffice.
  Future<void> _open(AuthTokens tokens) async {
    if (tokens.user.role != 'client') {
      try {
        await _repo.logout(tokens.refreshToken, accessToken: tokens.accessToken);
      } on AppFailure {
        // Révocation au mieux : le jeton expirera de lui-même.
      }
      throw AppFailure.localized(message: 'auth.wrong_role'.tr(), code: 'wrong_role');
    }
    await _session.open(tokens);
  }
}
```

`client/lib/features/auth/business_logic/auth_state.dart` :

```dart
import '../data/repositories/auth_repository.dart';

sealed class AuthState {
  const AuthState();
}

final class AuthInitial extends AuthState {
  const AuthInitial();
}

final class AuthSubmitting extends AuthState {
  const AuthSubmitting();
}

final class AuthOtpRequired extends AuthState {
  const AuthOtpRequired(this.start, this.channel);
  final RegisterStart start;
  final String channel;
}

final class AuthSucceeded extends AuthState {
  const AuthSucceeded();
}

final class AuthError extends AuthState {
  const AuthError(this.message);
  final String message;
}
```

`client/lib/features/auth/business_logic/auth_cubit.dart` :

```dart
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failures.dart';
import '../data/services/auth_service.dart';
import '../data/services/google_auth_service.dart';
import 'auth_state.dart';

class AuthCubit extends Cubit<AuthState> {
  AuthCubit(this._service) : super(const AuthInitial());
  final AuthService _service;

  bool get googleEnabled => _service.googleEnabled;

  Future<void> login(String identifier, String password) =>
      _run(() => _service.login(identifier, password));

  Future<void> signInWithGoogle() => _run(_service.signInWithGoogle);

  Future<void> verify({
    required String channel,
    required String target,
    required String code,
  }) => _run(() => _service.verify(channel: channel, target: target, code: code));

  Future<void> startRegistration({
    required String fullName,
    required String channel,
    required String contact,
    required String password,
  }) async {
    emit(const AuthSubmitting());
    try {
      final start = await _service.startRegistration(
        fullName: fullName,
        channel: channel,
        contact: contact,
        password: password,
      );
      if (!isClosed) emit(AuthOtpRequired(start, channel));
    } on AppFailure catch (f) {
      if (!isClosed) emit(AuthError(f.userMessage));
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    emit(const AuthSubmitting());
    try {
      await action();
      if (!isClosed) emit(const AuthSucceeded());
    } on GoogleSignInCancelled {
      if (!isClosed) emit(const AuthInitial());
    } on AppFailure catch (f) {
      if (!isClosed) emit(AuthError(f.userMessage));
    }
  }
}
```

- [ ] **Step 6 : vérifier la logique**

Run: `cd client && flutter test test/features/auth/`
Expected: PASS (5 tests).

- [ ] **Step 7 : écrans**

`client/lib/features/auth/presentation/screens/login_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/router/app_router.gr.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_text_field.dart';
import '../../../../shared/widgets/app_top_bar.dart';
import '../../../../shared/widgets/page_header.dart';
import '../../business_logic/auth_cubit.dart';
import '../../business_logic/auth_state.dart';

/// Rend `true` à l'écran appelant une fois la session ouverte.
@RoutePage()
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) => BlocProvider(
    create: (_) => sl<AuthCubit>(),
    child: const _LoginView(),
  );
}

class _LoginView extends StatefulWidget {
  const _LoginView();
  @override
  State<_LoginView> createState() => _LoginViewState();
}

class _LoginViewState extends State<_LoginView> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final ok = await context.router.push<bool>(const RegisterRoute());
    if (ok == true && mounted) context.router.maybePop(true);
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthCubit, AuthState>(
      listener: (context, state) {
        if (state is AuthSucceeded) context.router.maybePop(true);
      },
      builder: (context, state) {
        final cubit = context.read<AuthCubit>();
        final busy = state is AuthSubmitting;
        return Scaffold(
          appBar: AppTopBar(title: ''),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                PageHeader(
                  title: 'auth.login_title'.tr(),
                  description: 'auth.login_subtitle'.tr(),
                  padding: const EdgeInsets.only(bottom: 16),
                ),
                AppTextField(
                  controller: _identifier,
                  label: 'auth.identifier'.tr(),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                AppTextField(
                  controller: _password,
                  label: 'auth.password'.tr(),
                  obscureText: true,
                ),
                if (state is AuthError) ...[
                  const SizedBox(height: 12),
                  Text(
                    state.message,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ],
                const SizedBox(height: 20),
                AppButton(
                  label: 'auth.submit_login'.tr(),
                  expand: true,
                  isLoading: busy,
                  onPressed: busy
                      ? null
                      : () => cubit.login(_identifier.text.trim(), _password.text),
                ),
                if (cubit.googleEnabled) ...[
                  const SizedBox(height: 12),
                  AppButton(
                    label: 'auth.google'.tr(),
                    icon: LucideIcons.chrome,
                    variant: AppButtonVariant.secondary,
                    expand: true,
                    onPressed: busy ? null : cubit.signInWithGoogle,
                  ),
                ],
                const SizedBox(height: 8),
                AppButton(
                  label: 'auth.no_account'.tr(),
                  variant: AppButtonVariant.ghost,
                  expand: true,
                  onPressed: busy ? null : _register,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
```

Lire la signature d'`AppTextField` (`grep -n "this\." lib/shared/widgets/app_text_field.dart`) et adapter les noms de paramètres (`label`, `obscureText`, `keyboardType`) si besoin.

`client/lib/features/auth/presentation/screens/register_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/router/app_router.gr.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_sheet.dart';
import '../../../../shared/widgets/app_text_field.dart';
import '../../../../shared/widgets/app_top_bar.dart';
import '../../business_logic/auth_cubit.dart';
import '../../business_logic/auth_state.dart';

/// Rend `true` une fois le compte créé et la session ouverte.
@RoutePage()
class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context) => BlocProvider(
    create: (_) => sl<AuthCubit>(),
    child: const _RegisterView(),
  );
}

class _RegisterView extends StatefulWidget {
  const _RegisterView();
  @override
  State<_RegisterView> createState() => _RegisterViewState();
}

class _RegisterViewState extends State<_RegisterView> {
  final _name = TextEditingController();
  final _contact = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  String _channel = 'phone';
  String? _localError;

  @override
  void dispose() {
    for (final c in [_name, _contact, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit(AuthCubit cubit) {
    if (_name.text.trim().isEmpty || _contact.text.trim().isEmpty) {
      setState(() => _localError = 'auth.required'.tr());
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _localError = 'auth.password_mismatch'.tr());
      return;
    }
    setState(() => _localError = null);
    cubit.startRegistration(
      fullName: _name.text.trim(),
      channel: _channel,
      contact: _contact.text.trim(),
      password: _password.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthCubit, AuthState>(
      listener: (context, state) async {
        if (state is AuthOtpRequired) {
          final ok = await context.router.push<bool>(
            OtpRoute(channel: state.channel, start: state.start),
          );
          if (ok == true && context.mounted) context.router.maybePop(true);
        }
      },
      builder: (context, state) {
        final cubit = context.read<AuthCubit>();
        final busy = state is AuthSubmitting;
        final error = _localError ?? (state is AuthError ? state.message : null);
        return Scaffold(
          appBar: AppTopBar(title: 'auth.register_title'.tr()),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                AppTextField(controller: _name, label: 'auth.full_name'.tr()),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    AppChoiceChip(
                      label: 'auth.channel_phone'.tr(),
                      selected: _channel == 'phone',
                      onTap: () => setState(() => _channel = 'phone'),
                    ),
                    AppChoiceChip(
                      label: 'auth.channel_email'.tr(),
                      selected: _channel == 'email',
                      onTap: () => setState(() => _channel = 'email'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                AppTextField(
                  controller: _contact,
                  label: (_channel == 'phone' ? 'auth.phone' : 'auth.email').tr(),
                  keyboardType: _channel == 'phone'
                      ? TextInputType.phone
                      : TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                AppTextField(controller: _password, label: 'auth.password'.tr(), obscureText: true),
                const SizedBox(height: 12),
                AppTextField(controller: _confirm, label: 'auth.password_confirm'.tr(), obscureText: true),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                AppButton(
                  label: 'auth.submit_register'.tr(),
                  expand: true,
                  isLoading: busy,
                  onPressed: busy ? null : () => _submit(cubit),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
```

`client/lib/features/auth/presentation/screens/otp_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_text_field.dart';
import '../../../../shared/widgets/app_top_bar.dart';
import '../../../../shared/widgets/page_header.dart';
import '../../business_logic/auth_cubit.dart';
import '../../business_logic/auth_state.dart';
import '../../data/repositories/auth_repository.dart';

@RoutePage()
class OtpScreen extends StatelessWidget {
  const OtpScreen({required this.channel, required this.start, super.key});
  final String channel;
  final RegisterStart start;

  @override
  Widget build(BuildContext context) => BlocProvider(
    create: (_) => sl<AuthCubit>(),
    child: _OtpView(channel: channel, start: start),
  );
}

class _OtpView extends StatefulWidget {
  const _OtpView({required this.channel, required this.start});
  final String channel;
  final RegisterStart start;
  @override
  State<_OtpView> createState() => _OtpViewState();
}

class _OtpViewState extends State<_OtpView> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Le code de développement n'est montré qu'hors production : l'API ne le
    // renvoie d'ailleurs pas en production.
    final devCode = sl<AppConfig>().isProduction ? null : widget.start.devCode;
    return BlocConsumer<AuthCubit, AuthState>(
      listener: (context, state) {
        if (state is AuthSucceeded) context.router.maybePop(true);
      },
      builder: (context, state) {
        final busy = state is AuthSubmitting;
        return Scaffold(
          appBar: AppTopBar(title: ''),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                PageHeader(
                  title: 'auth.otp_title'.tr(),
                  description: 'auth.otp_subtitle'.tr(namedArgs: {'target': widget.start.target}),
                  padding: const EdgeInsets.only(bottom: 16),
                ),
                AppTextField(
                  controller: _code,
                  label: 'auth.otp_title'.tr(),
                  keyboardType: TextInputType.number,
                ),
                if (devCode != null) ...[
                  const SizedBox(height: 8),
                  Text('auth.otp_dev'.tr(namedArgs: {'code': devCode})),
                ],
                if (state is AuthError) ...[
                  const SizedBox(height: 12),
                  Text(state.message, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                AppButton(
                  label: 'auth.submit_otp'.tr(),
                  expand: true,
                  isLoading: busy,
                  onPressed: busy
                      ? null
                      : () => context.read<AuthCubit>().verify(
                          channel: widget.channel,
                          target: widget.start.target,
                          code: _code.text.trim(),
                        ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
```

La chaîne de retour : `OtpScreen` rend `true` à `RegisterScreen`, qui rend `true` à `LoginScreen`, qui rend `true` à l'appelant.

- [ ] **Step 8 : routes et DI**

`app_router.dart`, dans `routes` :

```dart
    AutoRoute(page: LoginRoute.page),
    AutoRoute(page: RegisterRoute.page),
    AutoRoute(page: OtpRoute.page),
```

`service_locator.dart`, sous `// ── Features` :

```dart
  sl.registerLazySingleton(() => AuthRepository(sl()));
  sl.registerLazySingleton(
    () => AuthService(
      sl(),
      sl(),
      sl(),
      google: AppConfig.googleServerClientId.isEmpty
          ? null
          : GoogleAuthService(
              GoogleSignIn(
                scopes: const ['email'],
                serverClientId: AppConfig.googleServerClientId,
              ),
            ),
    ),
  );
  sl.registerFactory(() => AuthCubit(sl()));
```

Run: `cd client && dart run build_runner build --delete-conflicting-outputs && flutter analyze`
Expected: génération sans erreur, aucun problème d'analyse.

- [ ] **Step 9 : commit (sur demande)**

```bash
git add pubspec.yaml pubspec.lock lib assets/translations test/features/auth
git commit -m "feat(auth): connexion, inscription avec otp et google, compte client uniquement"
```

---

### Task 5 : navigation — tiroir, gardes, profil

**Files:**
- Create: `client/lib/core/theme/app_icons.dart`
- Create: `client/lib/core/router/auth_guard.dart`
- Create: `client/lib/core/auth/require_session.dart`
- Create: `client/lib/shared/widgets/app_drawer.dart`
- Create: `client/lib/features/profile/presentation/screens/profile_screen.dart`
- Create: `client/lib/features/explore/presentation/screens/explore_screen.dart` (coquille, remplie à la Task 7)
- Delete: `client/lib/features/home/` (écran provisoire)
- Modify: `client/lib/core/router/app_router.dart`, traductions
- Test: `client/test/core/router/auth_guard_test.dart`

**Interfaces:**
- Consumes: `SessionController`, `AuthService.logout`, `LoginRoute` (Tasks 3-4).
- Produces: `AppSectionIcons` (`explore`, `search`, `favorites`, `bookings`, `profile`, `appearance`) ; `class AuthGuard extends AutoRouteGuard { AuthGuard(bool Function() isSignedIn, {Future<bool?> Function(StackRouter)? openLogin}) }` ; `Future<bool> requireSession(BuildContext context)` ; `AppDrawer` ; routes `ExploreRoute` (initiale), `ProfileRoute` (gardée).

- [ ] **Step 1 : traductions**

`fr.json` :

```json
"nav": {
  "explore": "Explorer",
  "bookings": "Mes réservations",
  "favorites": "Mes favoris",
  "profile": "Profil",
  "appearance": "Apparence et langue",
  "sign_in": "Se connecter",
  "guest": "Invité"
},
"profile": {
  "title": "Profil",
  "name": "Nom",
  "email": "E-mail",
  "phone": "Téléphone",
  "logout": "Se déconnecter"
}
```

`en.json` :

```json
"nav": {
  "explore": "Explore",
  "bookings": "My bookings",
  "favorites": "My favorites",
  "profile": "Profile",
  "appearance": "Appearance and language",
  "sign_in": "Sign in",
  "guest": "Guest"
},
"profile": {
  "title": "Profile",
  "name": "Name",
  "email": "Email",
  "phone": "Phone",
  "logout": "Sign out"
}
```

- [ ] **Step 2 : écrire le test qui échoue**

`client/test/core/router/auth_guard_test.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/router/auth_guard.dart';

class _Resolver implements NavigationResolver {
  bool? result;
  @override
  void next([bool continueNavigation = true]) => result = continueNavigation;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Router implements StackRouter {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('connecté : passe sans détour', () async {
    final resolver = _Resolver();
    await AuthGuard(() => true, openLogin: (_) async => fail('pas de connexion'))
        .onNavigation(resolver, _Router());
    expect(resolver.result, isTrue);
  });

  test('non connecté : passe après connexion réussie', () async {
    final resolver = _Resolver();
    await AuthGuard(() => false, openLogin: (_) async => true).onNavigation(resolver, _Router());
    expect(resolver.result, isTrue);
  });

  test('non connecté : bloqué si la connexion est abandonnée', () async {
    final resolver = _Resolver();
    await AuthGuard(() => false, openLogin: (_) async => null).onNavigation(resolver, _Router());
    expect(resolver.result, isFalse);
  });
}
```

- [ ] **Step 3 : vérifier l'échec**

Run: `cd client && flutter test test/core/router/auth_guard_test.dart`
Expected: FAIL — fichier introuvable.

- [ ] **Step 4 : implémenter**

`client/lib/core/theme/app_icons.dart` :

```dart
import 'package:flutter/widgets.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Icône de chaque section : une section garde le même pictogramme partout —
/// tiroir, en-tête, état vide.
abstract final class AppSectionIcons {
  static const IconData explore = LucideIcons.map;
  static const IconData search = LucideIcons.search;
  static const IconData favorites = LucideIcons.heart;
  static const IconData bookings = LucideIcons.calendarCheck;
  static const IconData profile = LucideIcons.circleUser;
  static const IconData appearance = LucideIcons.sunMoon;
}
```

`client/lib/core/router/auth_guard.dart` :

```dart
import 'package:auto_route/auto_route.dart';

import 'app_router.gr.dart';

/// Écran réservé à un compte connecté : la connexion s'ouvre par-dessus, et
/// la navigation reprend si elle aboutit.
class AuthGuard extends AutoRouteGuard {
  AuthGuard(this._isSignedIn, {Future<bool?> Function(StackRouter)? openLogin})
    : _openLogin = openLogin ?? ((router) => router.push<bool>(const LoginRoute()));

  /// Relu à chaque navigation : la session change après le démarrage.
  final bool Function() _isSignedIn;
  final Future<bool?> Function(StackRouter) _openLogin;

  @override
  Future<void> onNavigation(NavigationResolver resolver, StackRouter router) async {
    if (_isSignedIn()) return resolver.next();
    final ok = await _openLogin(router);
    resolver.next(ok == true);
  }
}
```

`client/lib/core/auth/require_session.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:flutter/widgets.dart';

import '../di/service_locator.dart';
import '../router/app_router.gr.dart';
import 'session_controller.dart';

/// Ouvre la connexion si besoin, sans quitter l'écran en cours.
///
/// Préféré à une garde de route pour le paiement : la feuille de réservation
/// reste ouverte dessous, dates et code promo compris.
Future<bool> requireSession(BuildContext context) async {
  if (sl<SessionController>().isSignedIn) return true;
  final ok = await context.router.push<bool>(const LoginRoute());
  return ok == true;
}
```

`client/lib/shared/widgets/app_drawer.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../core/auth/auth_user.dart';
import '../../core/auth/session_controller.dart';
import '../../core/di/service_locator.dart';
import '../../core/router/app_router.gr.dart';
import '../../core/theme/app_icons.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/resi_tokens.dart';
import 'app_button.dart';
import 'app_sheet.dart';
import 'language_switcher.dart';
import 'theme_switcher.dart';

/// Menu ☰ de l'accueil, façon Yango : la carte garde tout l'écran.
class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key});

  void _go(BuildContext context, PageRouteInfo route) {
    Navigator.of(context).pop();
    context.router.push(route);
  }

  void _appearance(BuildContext context) {
    Navigator.of(context).pop();
    showAppSheet<void>(
      context: context,
      builder: (_) => AppSheet(
        title: 'nav.appearance'.tr(),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [ThemeSwitcher(), SizedBox(height: 12), LanguageSwitcher()],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: SafeArea(
        child: ValueListenableBuilder<AuthUser?>(
          valueListenable: sl<SessionController>(),
          builder: (context, user, _) => ListView(
            padding: const EdgeInsets.symmetric(vertical: 16),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: user == null
                    ? AppButton(
                        label: 'nav.sign_in'.tr(),
                        expand: true,
                        onPressed: () => _go(context, const LoginRoute()),
                      )
                    : Row(
                        children: [
                          CircleAvatar(
                            radius: 22,
                            backgroundColor: context.tokens.border,
                            child: Text(
                              user.fullName.isEmpty ? '?' : user.fullName[0].toUpperCase(),
                              style: context.text.titleMedium,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(user.fullName, style: context.text.titleMedium),
                          ),
                        ],
                      ),
              ),
              _Item(
                icon: AppSectionIcons.bookings,
                label: 'nav.bookings'.tr(),
                onTap: () => _go(context, const BookingsRoute()),
              ),
              _Item(
                icon: AppSectionIcons.favorites,
                label: 'nav.favorites'.tr(),
                onTap: () => _go(context, const FavoritesRoute()),
              ),
              if (user != null)
                _Item(
                  icon: AppSectionIcons.profile,
                  label: 'nav.profile'.tr(),
                  onTap: () => _go(context, const ProfileRoute()),
                ),
              _Item(
                icon: AppSectionIcons.appearance,
                label: 'nav.appearance'.tr(),
                onTap: () => _appearance(context),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, size: 20),
    title: Text(label, style: context.text.bodyLarge),
    shape: AppRadius.mdShape,
    onTap: onTap,
  );
}
```

`BookingsRoute` et `FavoritesRoute` arrivent aux Tasks 9 et 12 : jusque-là, commenter ces deux entrées du tiroir et les décommenter dans ces tâches. Remplacer ce commentaire par l'entrée au fil de l'eau ; l'analyse doit rester propre à chaque tâche.

`client/lib/features/profile/presentation/screens/profile_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/auth/session_controller.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/router/app_router.gr.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_top_bar.dart';
import '../../../../shared/widgets/language_switcher.dart';
import '../../../../shared/widgets/page_header.dart';
import '../../../../shared/widgets/theme_switcher.dart';
import '../../../auth/data/services/auth_service.dart';

@RoutePage()
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = sl<SessionController>().value;
    return Scaffold(
      appBar: AppTopBar(title: 'profile.title'.tr()),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (user != null)
            DetailList(
              items: [
                DetailItem('profile.name'.tr(), user.fullName),
                if (user.email != null) DetailItem('profile.email'.tr(), user.email),
                if (user.phone != null) DetailItem('profile.phone'.tr(), user.phone),
              ],
            ),
          const SizedBox(height: 24),
          const ThemeSwitcher(),
          const SizedBox(height: 12),
          const LanguageSwitcher(),
          const SizedBox(height: 32),
          AppButton(
            label: 'profile.logout'.tr(),
            icon: LucideIcons.logOut,
            variant: AppButtonVariant.danger,
            expand: true,
            onPressed: () async {
              await sl<AuthService>().logout();
              if (context.mounted) context.router.replaceAll([const ExploreRoute()]);
            },
          ),
        ],
      ),
    );
  }
}
```

`client/lib/features/explore/presentation/screens/explore_screen.dart` (coquille) :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../../../shared/widgets/app_drawer.dart';

/// Accueil : carte et feuille « À la une » (Task 7).
@RoutePage()
class ExploreScreen extends StatelessWidget {
  const ExploreScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(drawer: AppDrawer(), body: SizedBox.expand());
}
```

Supprimer `lib/features/home/` et réécrire `app_router.dart` :

```dart
import 'package:auto_route/auto_route.dart';

import '../auth/session_controller.dart';
import '../di/service_locator.dart';
import 'app_router.gr.dart';
import 'auth_guard.dart';

// dart run build_runner build --delete-conflicting-outputs
@AutoRouterConfig(replaceInRouteName: 'Screen,Route')
class AppRouter extends RootStackRouter {
  @override
  RouteType get defaultRouteType => const RouteType.adaptive();

  /// La session est relue à chaque navigation, non figée à la construction.
  late final _signedIn = AuthGuard(() => sl<SessionController>().isSignedIn);

  @override
  List<AutoRoute> get routes => [
    AutoRoute(page: ExploreRoute.page, initial: true),
    AutoRoute(page: LoginRoute.page),
    AutoRoute(page: RegisterRoute.page),
    AutoRoute(page: OtpRoute.page),
    AutoRoute(page: ProfileRoute.page, guards: [_signedIn]),
  ];
}
```

Retirer aussi les clés `home.*` des traductions.

- [ ] **Step 5 : vérifier**

Run: `cd client && dart run build_runner build --delete-conflicting-outputs && flutter test && flutter analyze`
Expected: tests PASS (dont 3 nouveaux), analyse propre.

- [ ] **Step 6 : commit (sur demande)**

```bash
git add -A lib assets/translations test/core/router
git commit -m "feat(navigation): tiroir, garde de connexion et profil"
```

---

### Task 6 : localisation et recherche (données et état)

**Files:**
- Modify: `client/pubspec.yaml` (geolocator)
- Modify: `client/android/app/src/main/AndroidManifest.xml`, `client/ios/Runner/Info.plist` (permissions)
- Create: `client/lib/core/location/geo_point.dart`, `location_controller.dart`
- Create: `client/lib/features/search/data/search_query.dart`
- Create: `client/lib/features/search/data/sort_properties.dart`
- Create: `client/lib/features/property/data/repositories/property_repository.dart`
- Create: `client/lib/features/search/business_logic/search_cubit.dart`, `search_state.dart`
- Modify: `client/lib/core/di/service_locator.dart`
- Test: `client/test/core/location/geo_point_test.dart`, `client/test/features/search/search_query_test.dart`, `client/test/features/search/search_cubit_test.dart`

**Interfaces:**
- Consumes: `PropertyModel`, `Page`, `PageMeta`, `ApiEndpoints` (Task 1), `OccupiedPeriod` (Task 2).
- Produces:
  - `class GeoPoint { double latitude, longitude }`, `const abidjan`, `double distanceMeters(GeoPoint a, GeoPoint b)`.
  - `abstract class LocationSource { Future<GeoPoint?> current({required bool ask}); }`, `GeolocatorLocationSource`, `class LocationController extends ValueNotifier<GeoPoint?> { Future<GeoPoint?> refresh({bool ask = false}) }`.
  - `enum SearchSort { recommended, nearest, priceAsc }`, `class SearchQuery { String? city; DateTime? arrival; String? propertyType; int? minPrice, maxPrice, minBedrooms; double? minSurface; SearchSort sort; copyWith(...); Map<String,String> toQueryParameters({required int page, int perPage = 20}); int get activeFilterCount }`, `DateTime nextWeekend(DateTime now)`.
  - `List<PropertyModel> sortProperties(List<PropertyModel>, SearchSort, GeoPoint?)`.
  - `PropertyRepository`: `Future<Page<PropertyModel>> list(SearchQuery query, {required int page, int perPage = 20})`, `Future<List<PropertyModel>> featured({int perPage = 10})`, `Future<PropertyModel> show(String id)`, `Future<List<OccupiedPeriod>> availability(String id)`.
  - `SearchCubit` / `SearchState`: `SearchInitial`, `SearchLoading(SearchQuery query)`, `SearchLoaded(SearchQuery query, List<PropertyModel> items, PageMeta meta, {bool loadingMore})`, `SearchError(SearchQuery query, String message)` ; méthodes `search(SearchQuery)`, `loadMore()`, `retry()`.

- [ ] **Step 1 : dépendance et permissions**

`pubspec.yaml` :

```yaml
  # Position du client : centrer la carte, trier « Plus proches ». Jamais en
  # arrière-plan au lot 1.
  geolocator: ^14.0.3
```

`AndroidManifest.xml`, avant `<application` :

```xml
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
```

`Info.plist`, dans le `<dict>` racine :

```xml
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>Votre position sert à montrer les résidences proches de vous.</string>
```

Run: `cd client && flutter pub get`

- [ ] **Step 2 : écrire les tests qui échouent**

`client/test/core/location/geo_point_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/location/geo_point.dart';

void main() {
  test('Abidjan – Bouaké ≈ 300 km à vol d’oiseau', () {
    const bouake = GeoPoint(7.6906, -5.0303);
    final km = distanceMeters(abidjan, bouake) / 1000;
    expect(km, closeTo(300, 15));
  });

  test('distance nulle sur place', () {
    expect(distanceMeters(abidjan, abidjan), 0);
  });
}
```

`client/test/features/search/search_query_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/location/geo_point.dart';
import 'package:resi_client/features/property/data/models/property_model.dart';
import 'package:resi_client/features/search/data/search_query.dart';
import 'package:resi_client/features/search/data/sort_properties.dart';

PropertyModel p(String id, int price, {double? lat, double? lng}) => PropertyModel.fromJson({
  'id': id,
  'address': {'city': 'Abidjan', 'coordinates': {'latitude': lat, 'longitude': lng}},
  'pricing': {'daily_price': price},
});

void main() {
  group('SearchQuery.toQueryParameters', () {
    test('seuls les filtres posés partent', () {
      final q = SearchQuery(
        city: 'Abidjan',
        arrival: DateTime(2026, 10, 10),
        propertyType: 'villa',
        minPrice: 15000,
        minBedrooms: 2,
      );
      expect(q.toQueryParameters(page: 2), {
        'page': '2',
        'per_page': '20',
        'city': 'Abidjan',
        'available_from': '2026-10-10',
        'property_type': 'villa',
        'min_price': '15000',
        'min_bedrooms': '2',
      });
    });

    test('copyWith peut effacer un filtre', () {
      const q = SearchQuery(city: 'Abidjan', propertyType: 'villa');
      expect(q.copyWith(propertyType: null).propertyType, isNull);
      expect(q.copyWith(propertyType: null).city, 'Abidjan');
    });

    test('compte les filtres avancés actifs', () {
      expect(const SearchQuery(minPrice: 1, minBedrooms: 2).activeFilterCount, 2);
    });
  });

  group('nextWeekend', () {
    test('un mardi : le vendredi suivant', () {
      expect(nextWeekend(DateTime(2026, 10, 6)), DateTime(2026, 10, 9));
    });
    test('un samedi : aujourd’hui', () {
      expect(nextWeekend(DateTime(2026, 10, 10, 15)), DateTime(2026, 10, 10));
    });
  });

  group('sortProperties', () {
    final near = p('near', 30000, lat: 5.36, lng: -4.0);
    final far = p('far', 10000, lat: 7.69, lng: -5.03);
    final nowhere = p('nowhere', 20000);

    test('plus proches d’abord, sans coordonnées à la fin', () {
      expect(
        sortProperties([far, nowhere, near], SearchSort.nearest, abidjan).map((e) => e.id),
        ['near', 'far', 'nowhere'],
      );
    });

    test('sans position, l’ordre de l’API est gardé', () {
      expect(
        sortProperties([far, near], SearchSort.nearest, null).map((e) => e.id),
        ['far', 'near'],
      );
    });

    test('prix croissant', () {
      expect(
        sortProperties([near, far, nowhere], SearchSort.priceAsc, null).map((e) => e.id),
        ['far', 'nowhere', 'near'],
      );
    });
  });
}
```

`client/test/features/search/search_cubit_test.dart` :

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/error/failures.dart';
import 'package:resi_client/core/location/geo_point.dart';
import 'package:resi_client/core/location/location_controller.dart';
import 'package:resi_client/features/property/data/models/property_model.dart';
import 'package:resi_client/features/property/data/repositories/property_repository.dart';
import 'package:resi_client/features/search/business_logic/search_cubit.dart';
import 'package:resi_client/features/search/business_logic/search_state.dart';
import 'package:resi_client/features/search/data/search_query.dart';
import 'package:resi_client/shared/models/page_meta.dart';

class _Repo implements PropertyRepository {
  int calls = 0;
  bool failNext = false;

  @override
  Future<Page<PropertyModel>> list(SearchQuery query, {required int page, int perPage = 20}) async {
    calls++;
    if (failNext) throw AppFailure.noInternet();
    return Page(
      items: [PropertyModel.fromJson({'id': 'p$page'})],
      meta: PageMeta(total: 2, perPage: 1, currentPage: page, lastPage: 2),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoLocation implements LocationSource {
  @override
  Future<GeoPoint?> current({required bool ask}) async => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('recherche puis page suivante', () async {
    final repo = _Repo();
    final cubit = SearchCubit(repo, LocationController(_NoLocation()));

    await cubit.search(const SearchQuery(city: 'Abidjan'));
    await cubit.loadMore();
    await cubit.loadMore(); // plus de page : sans effet

    final state = cubit.state as SearchLoaded;
    expect(state.items.map((e) => e.id), ['p1', 'p2']);
    expect(state.meta.hasMore, isFalse);
    expect(repo.calls, 2);
  });

  test('échec : état d’erreur, puis nouvelle tentative', () async {
    final repo = _Repo()..failNext = true;
    final cubit = SearchCubit(repo, LocationController(_NoLocation()));

    await cubit.search(const SearchQuery());
    expect(cubit.state, isA<SearchError>());

    repo.failNext = false;
    await cubit.retry();
    expect(cubit.state, isA<SearchLoaded>());
  });
}
```

- [ ] **Step 3 : vérifier l'échec**

Run: `cd client && flutter test test/core/location test/features/search`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 4 : implémenter**

`client/lib/core/location/geo_point.dart` :

```dart
import 'dart:math' as math;

class GeoPoint {
  const GeoPoint(this.latitude, this.longitude);
  final double latitude;
  final double longitude;
}

/// Centre par défaut : le client sans position — à l'étranger, ou qui a
/// refusé la localisation — voit Abidjan, où se trouve l'essentiel de l'offre.
const abidjan = GeoPoint(5.3600, -4.0083);

/// Distance à vol d'oiseau (haversine), en mètres. Calculée ici plutôt que
/// par le plugin : le tri se teste sans plateforme.
double distanceMeters(GeoPoint a, GeoPoint b) {
  const earthRadius = 6371000.0;
  double rad(double deg) => deg * math.pi / 180;
  final dLat = rad(b.latitude - a.latitude);
  final dLng = rad(b.longitude - a.longitude);
  final h = math.pow(math.sin(dLat / 2), 2) +
      math.cos(rad(a.latitude)) * math.cos(rad(b.latitude)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * earthRadius * math.asin(math.sqrt(h));
}
```

`client/lib/core/location/location_controller.dart` :

```dart
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import 'geo_point.dart';

abstract class LocationSource {
  /// [ask] : demander la permission si elle n'a jamais été donnée.
  Future<GeoPoint?> current({required bool ask});
}

class GeolocatorLocationSource implements LocationSource {
  @override
  Future<GeoPoint?> current({required bool ask}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied && ask) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );
      return GeoPoint(position.latitude, position.longitude);
    } catch (_) {
      // Position indisponible (délai, GPS coupé) : l'accueil retombe sur
      // Abidjan plutôt que de rester bloqué.
      return null;
    }
  }
}

/// Dernière position connue, partagée par la carte et le tri.
class LocationController extends ValueNotifier<GeoPoint?> {
  LocationController(this._source) : super(null);
  final LocationSource _source;

  Future<GeoPoint?> refresh({bool ask = false}) async {
    final point = await _source.current(ask: ask);
    if (point != null) value = point;
    return value;
  }
}
```

`client/lib/features/search/data/search_query.dart` :

```dart
enum SearchSort { recommended, nearest, priceAsc }

/// Vendredi qui ouvre le prochain week-end, ou aujourd'hui si l'on y est.
DateTime nextWeekend(DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  if (now.weekday >= DateTime.friday) return today;
  return today.add(Duration(days: DateTime.friday - now.weekday));
}

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Critères d'une recherche ; seuls ceux que l'API sait filtrer.
class SearchQuery {
  const SearchQuery({
    this.city,
    this.arrival,
    this.propertyType,
    this.minPrice,
    this.maxPrice,
    this.minBedrooms,
    this.minSurface,
    this.sort = SearchSort.recommended,
  });

  final String? city;
  final DateTime? arrival;
  final String? propertyType;
  final int? minPrice;
  final int? maxPrice;
  final int? minBedrooms;
  final double? minSurface;
  final SearchSort sort;

  static const _keep = Object();

  /// Un argument absent garde la valeur ; `null` explicite l'efface.
  SearchQuery copyWith({
    Object? city = _keep,
    Object? arrival = _keep,
    Object? propertyType = _keep,
    Object? minPrice = _keep,
    Object? maxPrice = _keep,
    Object? minBedrooms = _keep,
    Object? minSurface = _keep,
    SearchSort? sort,
  }) => SearchQuery(
    city: identical(city, _keep) ? this.city : city as String?,
    arrival: identical(arrival, _keep) ? this.arrival : arrival as DateTime?,
    propertyType: identical(propertyType, _keep) ? this.propertyType : propertyType as String?,
    minPrice: identical(minPrice, _keep) ? this.minPrice : minPrice as int?,
    maxPrice: identical(maxPrice, _keep) ? this.maxPrice : maxPrice as int?,
    minBedrooms: identical(minBedrooms, _keep) ? this.minBedrooms : minBedrooms as int?,
    minSurface: identical(minSurface, _keep) ? this.minSurface : minSurface as double?,
    sort: sort ?? this.sort,
  );

  /// Filtres de la feuille avancée, pour le badge du bouton ⚙.
  int get activeFilterCount => [minPrice, maxPrice, minBedrooms, minSurface]
      .where((v) => v != null)
      .length;

  Map<String, String> toQueryParameters({required int page, int perPage = 20}) => {
    'page': '$page',
    'per_page': '$perPage',
    if (city != null && city!.isNotEmpty) 'city': city!,
    if (arrival != null) 'available_from': _ymd(arrival!),
    if (propertyType != null) 'property_type': propertyType!,
    if (minPrice != null) 'min_price': '$minPrice',
    if (maxPrice != null) 'max_price': '$maxPrice',
    if (minBedrooms != null) 'min_bedrooms': '$minBedrooms',
    if (minSurface != null) 'min_surface': '${minSurface!.round()}',
  };
}
```

`client/lib/features/search/data/sort_properties.dart` :

```dart
import '../../../core/location/geo_point.dart';
import '../../property/data/models/property_model.dart';
import 'search_query.dart';

/// Tri appliqué sur le téléphone : l'API ignore `sort`.
///
/// Tri stable : à égalité, l'ordre de l'API est conservé. Sans position,
/// « Plus proches » laisse la liste telle quelle plutôt que d'inventer.
List<PropertyModel> sortProperties(
  List<PropertyModel> items,
  SearchSort sort,
  GeoPoint? origin,
) {
  final indexed = items.indexed.toList();
  int byIndex((int, PropertyModel) a, (int, PropertyModel) b) => a.$1.compareTo(b.$1);

  switch (sort) {
    case SearchSort.recommended:
      return items;
    case SearchSort.priceAsc:
      indexed.sort((a, b) {
        final c = a.$2.dailyPrice.compareTo(b.$2.dailyPrice);
        return c != 0 ? c : byIndex(a, b);
      });
    case SearchSort.nearest:
      if (origin == null) return items;
      double distance(PropertyModel p) => p.hasLocation
          ? distanceMeters(origin, GeoPoint(p.latitude!, p.longitude!))
          : double.infinity;
      indexed.sort((a, b) {
        final c = distance(a.$2).compareTo(distance(b.$2));
        return c != 0 ? c : byIndex(a, b);
      });
  }
  return indexed.map((e) => e.$2).toList();
}
```

`client/lib/features/property/data/repositories/property_repository.dart` :

```dart
import 'package:dio/dio.dart';

import '../../../../core/api/api_endpoints.dart';
import '../../../../core/error/failures.dart';
import '../../../../shared/models/page_meta.dart';
import '../../../booking/domain/occupancy.dart';
import '../../../search/data/search_query.dart';
import '../models/property_model.dart';

class PropertyRepository {
  PropertyRepository(this._dio);
  final Dio _dio;

  Future<Page<PropertyModel>> list(SearchQuery query, {required int page, int perPage = 20}) =>
      _page(ApiEndpoints.properties, query.toQueryParameters(page: page, perPage: perPage));

  Future<List<PropertyModel>> featured({int perPage = 10}) async =>
      (await _page(ApiEndpoints.featured, {'per_page': '$perPage'})).items;

  Future<PropertyModel> show(String id) async {
    try {
      final res = await _dio.get(ApiEndpoints.property(id));
      return PropertyModel.fromJson((res.data['data'] as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }

  Future<List<OccupiedPeriod>> availability(String id) async {
    try {
      final res = await _dio.get(ApiEndpoints.availability(id));
      return (res.data['data'] as List)
          .whereType<Map>()
          .map((e) => OccupiedPeriod.fromJson(e.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }

  Future<Page<PropertyModel>> _page(String path, Map<String, String> params) async {
    try {
      final res = await _dio.get(path, queryParameters: params);
      final body = (res.data as Map).cast<String, dynamic>();
      return Page(
        items: (body['data'] as List)
            .whereType<Map>()
            .map((e) => PropertyModel.fromJson(e.cast<String, dynamic>()))
            .toList(),
        meta: PageMeta.fromJson((body['meta'] as Map).cast<String, dynamic>()),
      );
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }
}
```

`client/lib/features/search/business_logic/search_state.dart` :

```dart
import '../../../shared/models/page_meta.dart';
import '../../property/data/models/property_model.dart';
import '../data/search_query.dart';

sealed class SearchState {
  const SearchState();
}

final class SearchInitial extends SearchState {
  const SearchInitial();
}

final class SearchLoading extends SearchState {
  const SearchLoading(this.query);
  final SearchQuery query;
}

final class SearchLoaded extends SearchState {
  const SearchLoaded({
    required this.query,
    required this.items,
    required this.meta,
    this.loadingMore = false,
  });
  final SearchQuery query;
  final List<PropertyModel> items;
  final PageMeta meta;
  final bool loadingMore;
}

final class SearchError extends SearchState {
  const SearchError(this.query, this.message);
  final SearchQuery query;
  final String message;
}
```

`client/lib/features/search/business_logic/search_cubit.dart` :

```dart
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failures.dart';
import '../../../core/location/location_controller.dart';
import '../../property/data/repositories/property_repository.dart';
import '../data/search_query.dart';
import '../data/sort_properties.dart';
import 'search_state.dart';

/// Résultats de la recherche en cours, partagés par la pile de cartes et la
/// carte des résultats : basculer de l'une à l'autre ne relance rien.
class SearchCubit extends Cubit<SearchState> {
  SearchCubit(this._repo, this._location) : super(const SearchInitial());

  final PropertyRepository _repo;
  final LocationController _location;

  Future<void> search(SearchQuery query) async {
    emit(SearchLoading(query));
    try {
      final page = await _repo.list(query, page: 1);
      if (isClosed) return;
      emit(SearchLoaded(
        query: query,
        items: sortProperties(page.items, query.sort, _location.value),
        meta: page.meta,
      ));
    } on AppFailure catch (f) {
      if (!isClosed) emit(SearchError(query, f.userMessage));
    }
  }

  /// Page suivante, triée à part puis ajoutée : retrier toute la liste
  /// déplacerait des cartes que le client a déjà vues.
  Future<void> loadMore() async {
    final s = state;
    if (s is! SearchLoaded || !s.meta.hasMore || s.loadingMore) return;
    emit(SearchLoaded(query: s.query, items: s.items, meta: s.meta, loadingMore: true));
    try {
      final page = await _repo.list(s.query, page: s.meta.currentPage + 1);
      if (isClosed) return;
      emit(SearchLoaded(
        query: s.query,
        items: [...s.items, ...sortProperties(page.items, s.query.sort, _location.value)],
        meta: page.meta,
      ));
    } on AppFailure {
      if (!isClosed) emit(SearchLoaded(query: s.query, items: s.items, meta: s.meta));
    }
  }

  Future<void> retry() async {
    final s = state;
    if (s is SearchError) await search(s.query);
  }
}
```

`service_locator.dart` :

```dart
  sl.registerSingleton<LocationController>(LocationController(GeolocatorLocationSource()));
```

(sous `// ── Core`), et sous `// ── Features` :

```dart
  sl.registerLazySingleton(() => PropertyRepository(sl()));
  // Singleton de session : la pile et la carte des résultats lisent la même
  // liste.
  sl.registerLazySingleton(() => SearchCubit(sl(), sl()));
```

- [ ] **Step 5 : vérifier**

Run: `cd client && flutter test test/core/location test/features/search && flutter analyze`
Expected: PASS (13 tests), analyse propre.

- [ ] **Step 6 : commit (sur demande)**

```bash
git add pubspec.yaml pubspec.lock android ios lib test/core/location test/features/search
git commit -m "feat(search): position, criteres de recherche, tri et resultats pagines"
```

---

### Task 7 : accueil sur carte Google

**Files:**
- Modify: `client/pubspec.yaml` (google_maps_flutter, assets `assets/map/`)
- Create: `client/assets/map/light.json`, `client/assets/map/dark.json`
- Modify: `client/android/app/build.gradle.kts`, `AndroidManifest.xml` (clé)
- Modify: `client/ios/Runner/AppDelegate.swift`, `Info.plist`, `ios/Flutter/Debug.xcconfig`, `Release.xcconfig`, `client/.gitignore`
- Create: `client/lib/shared/widgets/price_pill.dart`
- Create: `client/lib/shared/widgets/properties_map.dart`
- Create: `client/lib/features/explore/business_logic/explore_cubit.dart`, `explore_state.dart`
- Create: `client/lib/features/explore/presentation/widgets/explore_sheet.dart`, `featured_card.dart`
- Modify: `client/lib/features/explore/presentation/screens/explore_screen.dart`
- Test: `client/test/features/explore/explore_cubit_test.dart`, `client/test/shared/price_pill_test.dart`

**Interfaces:**
- Consumes: `PropertyRepository.featured/list`, `LocationController`, `abidjan`, `formatFcfa`, `SearchQuery`.
- Produces:
  - `Future<Uint8List> renderPricePill(String label, {required bool selected, required ResiTokens tokens, double pixelRatio = 3})`.
  - `PropertiesMap({required List<PropertyModel> properties, required GeoPoint center, String? selectedId, required ValueChanged<PropertyModel> onSelect, bool showMyLocation = false, double bottomPadding = 0})`.
  - `ExploreCubit` / `ExploreState` : `ExploreLoading`, `ExploreReady({featured, pins, center, located, selectedId})`, `ExploreError(message)` ; `load()`, `locate()`, `select(String? id)`.
  - `FeaturedCard(property, onTap)`.

- [ ] **Step 1 : dépendance, clé et styles**

`pubspec.yaml` :

```yaml
  # Carte vectorielle de l'accueil, au rendu proche de Yango. L'affichage
  # d'une carte dans une app mobile native n'est pas facturé par Google.
  google_maps_flutter: ^2.12.0
```

et sous `flutter: assets:` ajouter `- assets/map/`.

Run: `cd client && flutter pub get`. Si la version résolue exige un Flutter plus récent que 3.38.3 (erreur de compilation au Step 7, comme `auto_route` 11.2), la borner à la dernière version qui compile et justifier la borne en commentaire.

Clé Android — `android/app/build.gradle.kts`, dans `defaultConfig { … }` :

```kotlin
        // Clé Google Maps fournie à la compilation, jamais commitée :
        // MAPS_API_KEY en variable d'environnement ou dans
        // android/local.properties (ignoré par git).
        manifestPlaceholders["MAPS_API_KEY"] =
            System.getenv("MAPS_API_KEY")
                ?: java.util.Properties().apply {
                    val f = rootProject.file("local.properties")
                    if (f.exists()) f.inputStream().use { load(it) }
                }.getProperty("MAPS_API_KEY", "")
```

`AndroidManifest.xml`, dans `<application>` :

```xml
        <meta-data android:name="com.google.android.geo.API_KEY" android:value="${MAPS_API_KEY}"/>
```

et, dans `<queries>` (créer le bloc s'il manque, au niveau de `<manifest>`), pour ouvrir l'appli Wave à la Task 11 :

```xml
        <intent>
            <action android:name="android.intent.action.VIEW"/>
            <data android:scheme="https"/>
        </intent>
```

Clé iOS — créer `ios/Flutter/Secrets.xcconfig` (non commité) :

```
MAPS_API_KEY=
```

ajouter `#include? "Secrets.xcconfig"` en tête de `ios/Flutter/Debug.xcconfig` et `Release.xcconfig`, `ios/Flutter/Secrets.xcconfig` à `client/.gitignore`, puis dans `Info.plist` :

```xml
	<key>GMSApiKey</key>
	<string>$(MAPS_API_KEY)</string>
```

et dans `ios/Runner/AppDelegate.swift`, avant `GeneratedPluginRegistrant.register(with: self)` :

```swift
    GMSServices.provideAPIKey(Bundle.main.object(forInfoDictionaryKey: "GMSApiKey") as? String ?? "")
```

avec `import GoogleMaps` en tête.

`client/assets/map/light.json` :

```json
[
  {"elementType": "geometry", "stylers": [{"color": "#f5f5f5"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#5f5f66"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#f5f5f5"}]},
  {"featureType": "poi", "stylers": [{"visibility": "off"}]},
  {"featureType": "poi.park", "elementType": "geometry", "stylers": [{"visibility": "on"}, {"color": "#e6ede3"}]},
  {"featureType": "road", "elementType": "geometry", "stylers": [{"color": "#ffffff"}]},
  {"featureType": "road.arterial", "elementType": "labels", "stylers": [{"visibility": "off"}]},
  {"featureType": "road.highway", "elementType": "geometry", "stylers": [{"color": "#e5e5e8"}]},
  {"featureType": "transit", "stylers": [{"visibility": "off"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#dfe3e8"}]}
]
```

`client/assets/map/dark.json` :

```json
[
  {"elementType": "geometry", "stylers": [{"color": "#121212"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#a1a1a8"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#121212"}]},
  {"featureType": "poi", "stylers": [{"visibility": "off"}]},
  {"featureType": "poi.park", "elementType": "geometry", "stylers": [{"visibility": "on"}, {"color": "#16201a"}]},
  {"featureType": "road", "elementType": "geometry", "stylers": [{"color": "#27272a"}]},
  {"featureType": "road.arterial", "elementType": "labels", "stylers": [{"visibility": "off"}]},
  {"featureType": "road.highway", "elementType": "geometry", "stylers": [{"color": "#3f3f46"}]},
  {"featureType": "transit", "stylers": [{"visibility": "off"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#000000"}]}
]
```

- [ ] **Step 2 : traductions**

`fr.json` :

```json
"explore": {
  "where": "Où souhaitez-vous séjourner ?",
  "featured": "À la une",
  "featured_empty": "Aucune résidence à la une pour le moment.",
  "locate": "Me localiser",
  "per_day": "/ jour"
}
```

`en.json` :

```json
"explore": {
  "where": "Where would you like to stay?",
  "featured": "Featured",
  "featured_empty": "No featured residences yet.",
  "locate": "Locate me",
  "per_day": "/ day"
}
```

- [ ] **Step 3 : écrire les tests qui échouent**

`client/test/shared/price_pill_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/theme/resi_tokens.dart';
import 'package:resi_client/shared/widgets/price_pill.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('dessine une image PNG, plus large une fois sélectionnée ou non', () async {
    final bytes = await renderPricePill('25 000 F', selected: false, tokens: ResiTokens.light);
    // Signature PNG.
    expect(bytes.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
  });
}
```

`client/test/features/explore/explore_cubit_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/location/geo_point.dart';
import 'package:resi_client/core/location/location_controller.dart';
import 'package:resi_client/features/explore/business_logic/explore_cubit.dart';
import 'package:resi_client/features/explore/business_logic/explore_state.dart';
import 'package:resi_client/features/property/data/models/property_model.dart';
import 'package:resi_client/features/property/data/repositories/property_repository.dart';
import 'package:resi_client/features/search/data/search_query.dart';
import 'package:resi_client/shared/models/page_meta.dart';

class _Repo implements PropertyRepository {
  @override
  Future<List<PropertyModel>> featured({int perPage = 10}) async =>
      [PropertyModel.fromJson({'id': 'f1'})];

  @override
  Future<Page<PropertyModel>> list(SearchQuery query, {required int page, int perPage = 20}) async =>
      Page(
        items: [PropertyModel.fromJson({'id': 'p1'})],
        meta: const PageMeta(total: 1, perPage: 50, currentPage: 1, lastPage: 1),
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Source implements LocationSource {
  _Source(this.point);
  GeoPoint? point;
  final asked = <bool>[];
  @override
  Future<GeoPoint?> current({required bool ask}) async {
    asked.add(ask);
    return point;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('sans position : centré sur Abidjan, sans redemander la permission', () async {
    final source = _Source(null);
    final cubit = ExploreCubit(_Repo(), LocationController(source));
    await cubit.load();

    final s = cubit.state as ExploreReady;
    expect(s.center.latitude, abidjan.latitude);
    expect(s.located, isFalse);
    expect(s.featured.single.id, 'f1');
    expect(source.asked, [false]);
  });

  test('« Me localiser » demande la permission et recentre', () async {
    final source = _Source(null);
    final cubit = ExploreCubit(_Repo(), LocationController(source));
    await cubit.load();

    source.point = const GeoPoint(5.3, -3.9);
    await cubit.locate();

    final s = cubit.state as ExploreReady;
    expect(s.located, isTrue);
    expect(s.center.latitude, 5.3);
    expect(source.asked.last, isTrue);
  });

  test('sélection d’une pastille', () async {
    final cubit = ExploreCubit(_Repo(), LocationController(_Source(null)));
    await cubit.load();
    cubit.select('p1');
    expect((cubit.state as ExploreReady).selectedId, 'p1');
  });
}
```

- [ ] **Step 4 : vérifier l'échec**

Run: `cd client && flutter test test/shared/price_pill_test.dart test/features/explore`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 5 : implémenter**

`client/lib/shared/widgets/price_pill.dart` :

```dart
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

import '../../core/theme/app_typography.dart';
import '../../core/theme/resi_tokens.dart';

/// Pastille de prix d'une résidence sur la carte, dessinée en image.
///
/// Google Maps n'affiche pas de widget Flutter comme marqueur : la pastille
/// est peinte sur un canevas, aux couleurs du thème. Sélectionnée, elle passe
/// en `primary` et grossit.
Future<Uint8List> renderPricePill(
  String label, {
  required bool selected,
  required ResiTokens tokens,
  double pixelRatio = 3,
}) async {
  final fontSize = selected ? 13.0 : 12.0;
  final text = TextPainter(
    text: TextSpan(
      text: label,
      style: TextStyle(
        fontFamily: AppTypography.fontFamily,
        fontSize: fontSize,
        fontWeight: FontWeight.w600,
        color: selected ? tokens.primaryForeground : tokens.foreground,
      ),
    ),
    textDirection: TextDirection.ltr,
  )..layout();

  final horizontal = selected ? 12.0 : 10.0;
  const vertical = 6.0;
  final width = text.width + horizontal * 2;
  final height = text.height + vertical * 2;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder)..scale(pixelRatio);
  final shape = RRect.fromRectAndRadius(
    Rect.fromLTWH(0, 0, width, height),
    Radius.circular(height / 2),
  );
  canvas.drawRRect(shape, Paint()..color = selected ? tokens.primary : tokens.surface);
  canvas.drawRRect(
    shape.deflate(0.5),
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = selected ? tokens.primary : tokens.border,
  );
  text.paint(canvas, Offset(horizontal, vertical));

  final image = await recorder.endRecording().toImage(
    (width * pixelRatio).ceil(),
    (height * pixelRatio).ceil(),
  );
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}
```

`client/lib/shared/widgets/properties_map.dart` :

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/location/geo_point.dart';
import '../../core/theme/resi_tokens.dart';
import '../../features/property/data/models/property_model.dart';
import '../utils/money.dart';
import 'price_pill.dart';

/// Carte des résidences : une pastille de prix par résidence localisée.
class PropertiesMap extends StatefulWidget {
  const PropertiesMap({
    required this.properties,
    required this.center,
    required this.onSelect,
    this.selectedId,
    this.showMyLocation = false,
    this.bottomPadding = 0,
    super.key,
  });

  final List<PropertyModel> properties;
  final GeoPoint center;
  final String? selectedId;
  final ValueChanged<PropertyModel> onSelect;
  final bool showMyLocation;

  /// Place réservée sous la carte (feuille), pour que le logo et le centrage
  /// restent visibles.
  final double bottomPadding;

  @override
  State<PropertiesMap> createState() => _PropertiesMapState();
}

class _PropertiesMapState extends State<PropertiesMap> {
  GoogleMapController? _controller;
  String? _style;
  Brightness? _styleFor;
  Set<Marker> _markers = const {};

  /// Les pastilles sont mises en cache par prix, état et thème : les redessiner
  /// à chaque reconstruction ferait clignoter la carte.
  final _icons = <String, BitmapDescriptor>{};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final brightness = Theme.of(context).brightness;
    if (brightness != _styleFor) {
      _styleFor = brightness;
      rootBundle
          .loadString(brightness == Brightness.dark ? 'assets/map/dark.json' : 'assets/map/light.json')
          .then((s) => mounted ? setState(() => _style = s) : null);
    }
    _buildMarkers();
  }

  @override
  void didUpdateWidget(PropertiesMap old) {
    super.didUpdateWidget(old);
    if (old.properties != widget.properties || old.selectedId != widget.selectedId) {
      _buildMarkers();
    }
    if (old.center.latitude != widget.center.latitude ||
        old.center.longitude != widget.center.longitude) {
      _controller?.animateCamera(
        CameraUpdate.newLatLng(LatLng(widget.center.latitude, widget.center.longitude)),
      );
    }
  }

  Future<void> _buildMarkers() async {
    final tokens = context.tokens;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final markers = <Marker>{};
    for (final p in widget.properties.where((p) => p.hasLocation)) {
      final selected = p.id == widget.selectedId;
      final label = formatFcfa(p.dailyPrice);
      final key = '$label|$selected|$dark';
      final icon = _icons[key] ??= BitmapDescriptor.bytes(
        await renderPricePill(label, selected: selected, tokens: tokens),
        imagePixelRatio: 3,
      );
      markers.add(Marker(
        markerId: MarkerId(p.id),
        position: LatLng(p.latitude!, p.longitude!),
        icon: icon,
        zIndexInt: selected ? 1 : 0,
        onTap: () => widget.onSelect(p),
      ));
    }
    if (mounted) setState(() => _markers = markers);
  }

  @override
  Widget build(BuildContext context) {
    return GoogleMap(
      initialCameraPosition: CameraPosition(
        target: LatLng(widget.center.latitude, widget.center.longitude),
        zoom: 13,
      ),
      style: _style,
      markers: _markers,
      myLocationEnabled: widget.showMyLocation,
      myLocationButtonEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      compassEnabled: false,
      padding: EdgeInsets.only(bottom: widget.bottomPadding),
      onMapCreated: (c) => _controller = c,
    );
  }
}
```

Si `zIndexInt` n'existe pas dans la version résolue, utiliser `zIndex: selected ? 1 : 0` (double).

`client/lib/features/explore/business_logic/explore_state.dart` :

```dart
import '../../../core/location/geo_point.dart';
import '../../property/data/models/property_model.dart';

sealed class ExploreState {
  const ExploreState();
}

final class ExploreLoading extends ExploreState {
  const ExploreLoading();
}

final class ExploreReady extends ExploreState {
  const ExploreReady({
    required this.featured,
    required this.pins,
    required this.center,
    required this.located,
    this.selectedId,
  });

  final List<PropertyModel> featured;

  /// Résidences posées sur la carte.
  final List<PropertyModel> pins;
  final GeoPoint center;

  /// La position du client est connue (point bleu affiché).
  final bool located;
  final String? selectedId;

  ExploreReady copyWith({GeoPoint? center, bool? located, Object? selectedId = _keep}) =>
      ExploreReady(
        featured: featured,
        pins: pins,
        center: center ?? this.center,
        located: located ?? this.located,
        selectedId: identical(selectedId, _keep) ? this.selectedId : selectedId as String?,
      );

  static const _keep = Object();
}

final class ExploreError extends ExploreState {
  const ExploreError(this.message);
  final String message;
}
```

`client/lib/features/explore/business_logic/explore_cubit.dart` :

```dart
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failures.dart';
import '../../../core/location/geo_point.dart';
import '../../../core/location/location_controller.dart';
import '../../property/data/repositories/property_repository.dart';
import '../../search/data/search_query.dart';
import 'explore_state.dart';

class ExploreCubit extends Cubit<ExploreState> {
  ExploreCubit(this._repo, this._location) : super(const ExploreLoading());

  final PropertyRepository _repo;
  final LocationController _location;

  /// Pastilles posées sur la carte d'accueil : une page large suffit au
  /// lot 1, la recherche par rayon côté API arrive au lot 2.
  static const _pinsPerPage = 50;

  Future<void> load() async {
    emit(const ExploreLoading());
    try {
      // Sans demander la permission : l'accueil ne la réclame pas d'emblée,
      // le bouton ◎ la propose.
      final position = await _location.refresh();
      final featured = await _repo.featured();
      final pins = await _repo.list(const SearchQuery(), page: 1, perPage: _pinsPerPage);
      if (isClosed) return;
      emit(ExploreReady(
        featured: featured,
        pins: pins.items,
        center: position ?? abidjan,
        located: position != null,
      ));
    } on AppFailure catch (f) {
      if (!isClosed) emit(ExploreError(f.userMessage));
    }
  }

  Future<void> locate() async {
    final position = await _location.refresh(ask: true);
    final s = state;
    if (isClosed || s is! ExploreReady || position == null) return;
    emit(s.copyWith(center: position, located: true));
  }

  void select(String? id) {
    final s = state;
    if (s is ExploreReady) emit(s.copyWith(selectedId: id));
  }
}
```

`client/lib/features/explore/presentation/widgets/featured_card.dart` :

```dart
import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../../shared/utils/money.dart';
import '../../../property/data/models/property_model.dart';

class FeaturedCard extends StatelessWidget {
  const FeaturedCard({required this.property, required this.onTap, super.key});
  final PropertyModel property;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return SizedBox(
      width: 168,
      child: Material(
        color: t.surface,
        shape: AppRadius.outlined(AppRadius.md, t.border),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 16 / 10,
                child: property.images.isEmpty
                    ? ColoredBox(color: t.border)
                    : CachedNetworkImage(imageUrl: property.images.first, fit: BoxFit.cover),
              ),
              Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(property.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: context.text.titleSmall),
                    Text(property.city, style: context.mutedText),
                    const SizedBox(height: 4),
                    Text.rich(TextSpan(children: [
                      TextSpan(text: formatFcfa(property.dailyPrice), style: context.text.amount),
                      TextSpan(text: ' ${'explore.per_day'.tr()}', style: context.mutedText),
                    ])),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

`cached_network_image` s'ajoute ici au `pubspec.yaml` :

```yaml
  # Photos des résidences mises en cache disque : la pile de cartes en charge
  # beaucoup, et les recharger à chaque passage gaspillerait les données.
  cached_network_image: ^3.4.1
```

Vérifier `AppRadius.outlined(rayon, couleur)` (`grep -n "outlined" lib/core/theme/app_radius.dart`) ; la signature y est documentée.

`client/lib/features/explore/presentation/widgets/explore_sheet.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/router/app_router.gr.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../property/data/models/property_model.dart';
import 'featured_card.dart';

/// Feuille de l'accueil : « Où séjourner ? » puis « À la une ».
///
/// Point d'entrée du client hors de Côte d'Ivoire, pour qui la carte, sans
/// position, n'a rien à montrer.
class ExploreSheet extends StatelessWidget {
  const ExploreSheet({required this.scroll, required this.featured, this.selected, super.key});

  final ScrollController scroll;
  final List<PropertyModel> featured;

  /// Résidence touchée sur la carte, montrée en tête de feuille.
  final PropertyModel? selected;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    void open(PropertyModel p) =>
        context.router.push(PropertyDetailRoute(propertyId: p.id, initial: p));

    return Material(
      color: t.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.only(topLeft: AppRadius.lg.topLeft, topRight: AppRadius.lg.topRight),
        side: BorderSide(color: t.border),
      ),
      child: ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(color: t.border, borderRadius: AppRadius.pill),
            ),
          ),
          const SizedBox(height: 12),
          Material(
            color: t.background,
            shape: AppRadius.mdShape,
            child: InkWell(
              customBorder: AppRadius.mdShape,
              onTap: () => context.router.push(const SearchRoute()),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                child: Row(children: [
                  const Icon(LucideIcons.search, size: 18),
                  const SizedBox(width: 10),
                  Text('explore.where'.tr(), style: context.text.titleSmall),
                ]),
              ),
            ),
          ),
          if (selected != null) ...[
            const SizedBox(height: 16),
            SizedBox(height: 200, child: FeaturedCard(property: selected!, onTap: () => open(selected!))),
          ],
          const SizedBox(height: 20),
          Text('explore.featured'.tr(), style: context.text.titleMedium),
          const SizedBox(height: 10),
          if (featured.isEmpty)
            Text('explore.featured_empty'.tr(), style: context.mutedText)
          else
            SizedBox(
              height: 200,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: featured.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (_, i) => FeaturedCard(property: featured[i], onTap: () => open(featured[i])),
              ),
            ),
        ],
      ),
    );
  }
}
```

`SearchRoute` (Task 8) et `PropertyDetailRoute` (Task 10) n'existent pas encore : dans cette tâche, remplacer les deux `push` par `() {}` et un commentaire `// Task 8` / `// Task 10`, à rétablir dans ces tâches. L'analyse doit rester propre.

`client/lib/features/explore/presentation/screens/explore_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../shared/widgets/app_drawer.dart';
import '../../../../shared/widgets/app_icon_button.dart';
import '../../../../shared/widgets/app_loader.dart';
import '../../../../shared/widgets/error_state.dart';
import '../../../../shared/widgets/frosted_surface.dart';
import '../../../../shared/widgets/properties_map.dart';
import '../../business_logic/explore_cubit.dart';
import '../../business_logic/explore_state.dart';
import '../widgets/explore_sheet.dart';

@RoutePage()
class ExploreScreen extends StatelessWidget {
  const ExploreScreen({super.key});

  @override
  Widget build(BuildContext context) => BlocProvider(
    create: (_) => sl<ExploreCubit>()..load(),
    child: const _ExploreView(),
  );
}

class _ExploreView extends StatelessWidget {
  const _ExploreView();

  /// Hauteurs d'ancrage de la feuille, en fraction de l'écran.
  static const _min = 0.18;
  static const _initial = 0.34;
  static const _max = 0.88;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const AppDrawer(),
      body: BlocBuilder<ExploreCubit, ExploreState>(
        builder: (context, state) => switch (state) {
          ExploreLoading() => const AppLoaderScreen(),
          ExploreError(:final message) => ErrorState(
            message: message,
            onRetry: context.read<ExploreCubit>().load,
          ),
          ExploreReady() => _ready(context, state),
        },
      ),
    );
  }

  Widget _ready(BuildContext context, ExploreReady state) {
    final cubit = context.read<ExploreCubit>();
    final height = MediaQuery.sizeOf(context).height;
    final selected = state.pins.where((p) => p.id == state.selectedId).firstOrNull;

    return Stack(
      children: [
        PropertiesMap(
          properties: state.pins,
          center: state.center,
          selectedId: state.selectedId,
          showMyLocation: state.located,
          bottomPadding: height * _initial,
          onSelect: (p) => cubit.select(p.id),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Builder(
                  builder: (context) => FrostedSurface(
                    borderRadius: FrostedSurface.pill,
                    child: AppIconButton(
                      icon: LucideIcons.menu,
                      label: 'nav.explore'.tr(),
                      onPressed: () => Scaffold.of(context).openDrawer(),
                    ),
                  ),
                ),
                const Spacer(),
                FrostedSurface(
                  borderRadius: FrostedSurface.pill,
                  child: AppIconButton(
                    icon: LucideIcons.locateFixed,
                    label: 'explore.locate'.tr(),
                    onPressed: cubit.locate,
                  ),
                ),
              ],
            ),
          ),
        ),
        DraggableScrollableSheet(
          minChildSize: _min,
          initialChildSize: _initial,
          maxChildSize: _max,
          snap: true,
          snapSizes: const [_initial],
          builder: (context, scroll) => ExploreSheet(
            scroll: scroll,
            featured: state.featured,
            selected: selected,
          ),
        ),
      ],
    );
  }
}
```

`service_locator.dart` :

```dart
  sl.registerFactory(() => ExploreCubit(sl(), sl()));
```

- [ ] **Step 6 : vérifier**

Run: `cd client && flutter test test/shared/price_pill_test.dart test/features/explore && flutter analyze`
Expected: PASS (4 tests), analyse propre.

- [ ] **Step 7 : vérifier la compilation et la carte**

Run: `cd client && MAPS_API_KEY=<clé> flutter build apk --debug -t lib/main_dev.dart`
Expected: `√ Built build/app/outputs/flutter-apk/app-debug.apk`. Sur appareil : carte stylée claire, puis sombre après bascule du thème (tiroir → Apparence) ; pastilles de prix ; toucher une pastille la noircit et l'affiche en tête de feuille ; ◎ demande la permission puis recentre. Sans clé : carte grise, le reste fonctionne.

- [ ] **Step 8 : commit (sur demande)**

```bash
git add pubspec.yaml pubspec.lock assets/map android ios .gitignore lib assets/translations test
git commit -m "feat(explore): accueil sur carte google, pastilles de prix et feuille a la une"
```

---

### Task 8 : écran de recherche et filtres

**Files:**
- Create: `client/assets/data/cities/ci.json` (copie de `mobile/assets/data/cities/ci.json`)
- Modify: `client/pubspec.yaml` (asset `assets/data/cities/`)
- Create: `client/lib/features/search/presentation/screens/search_screen.dart`
- Create: `client/lib/features/search/presentation/widgets/filters_sheet.dart`
- Modify: `client/lib/core/router/app_router.dart`, `explore_sheet.dart` (rétablir `SearchRoute`), traductions
- Test: `client/test/features/search/search_screen_test.dart`

**Interfaces:**
- Consumes: `SearchQuery`, `SearchSort`, `nextWeekend`, `SearchCubit.search`, `LocationController`.
- Produces: `SearchScreen` (route `SearchRoute`) — à la validation, `SearchCubit.search(query)` puis `push(DiscoverRoute())` ; `Future<SearchQuery?> showFiltersSheet(BuildContext, SearchQuery)`.

- [ ] **Step 1 : traductions**

`fr.json` :

```json
"search": {
  "title": "Où séjourner ?",
  "destination": "Ville",
  "near_me": "Autour de moi",
  "near_me_hint": "Position actuelle",
  "when": "Quand",
  "tonight": "Ce soir",
  "weekend": "Ce week-end",
  "pick_date": "Choisir",
  "type": "Type",
  "types": {"studio": "Studio", "apartment": "Appartement", "villa": "Villa", "duplex": "Duplex"},
  "submit": "Voir les résidences",
  "filters": "Filtres",
  "reset": "Réinitialiser",
  "budget": "Budget par jour",
  "bedrooms": "Chambres (min.)",
  "surface": "Surface (min.)",
  "sort": "Trier par",
  "sorts": {"recommended": "Recommandées", "nearest": "Plus proches", "priceAsc": "Prix croissant"},
  "apply": "Appliquer",
  "any": "Indifférent"
}
```

`en.json` :

```json
"search": {
  "title": "Where to stay?",
  "destination": "City",
  "near_me": "Near me",
  "near_me_hint": "Current location",
  "when": "When",
  "tonight": "Tonight",
  "weekend": "This weekend",
  "pick_date": "Pick",
  "type": "Type",
  "types": {"studio": "Studio", "apartment": "Apartment", "villa": "Villa", "duplex": "Duplex"},
  "submit": "Show residences",
  "filters": "Filters",
  "reset": "Reset",
  "budget": "Budget per day",
  "bedrooms": "Bedrooms (min.)",
  "surface": "Area (min.)",
  "sort": "Sort by",
  "sorts": {"recommended": "Recommended", "nearest": "Nearest", "priceAsc": "Lowest price"},
  "apply": "Apply",
  "any": "Any"
}
```

- [ ] **Step 2 : écrire le test qui échoue**

`client/test/features/search/search_screen_test.dart` :

```dart
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/theme/app_theme.dart';
import 'package:resi_client/features/search/data/search_query.dart';
import 'package:resi_client/features/search/presentation/screens/search_screen.dart';

void main() {
  testWidgets('choisir une ville et un type construit la requête', (tester) async {
    SearchQuery? submitted;
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: SearchForm(
        cities: const ['Abidjan', 'Bouaké'],
        initial: const SearchQuery(),
        onSubmit: (q) => submitted = q,
      ),
    ));

    await tester.enterText(find.byType(TextField), 'Abi');
    await tester.pump();
    await tester.tap(find.text('Abidjan'));
    await tester.tap(find.text('search.types.villa'.tr()));
    await tester.tap(find.text('search.submit'.tr()));
    await tester.pump();

    expect(submitted?.city, 'Abidjan');
    expect(submitted?.propertyType, 'villa');
  });
}
```

`SearchForm` est le corps de l'écran, testable sans routeur ni DI ; `SearchScreen` l'enveloppe.

- [ ] **Step 3 : vérifier l'échec**

Run: `cd client && flutter test test/features/search/search_screen_test.dart`
Expected: FAIL — fichier introuvable.

- [ ] **Step 4 : implémenter**

Copier les villes : `cp ../mobile/assets/data/cities/ci.json assets/data/cities/ci.json` et déclarer `- assets/data/cities/` dans le `pubspec.yaml`.

`client/lib/features/search/presentation/screens/search_screen.dart` :

```dart
import 'dart:convert';

import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/location/location_controller.dart';
import '../../../../core/router/app_router.gr.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_sheet.dart';
import '../../../../shared/widgets/app_top_bar.dart';
import '../../business_logic/search_cubit.dart';
import '../../data/search_query.dart';
import '../widgets/filters_sheet.dart';

@RoutePage()
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  List<String> _cities = const [];

  @override
  void initState() {
    super.initState();
    rootBundle.loadString('assets/data/cities/ci.json').then((raw) {
      if (mounted) setState(() => _cities = (jsonDecode(raw) as List).cast<String>());
    });
  }

  Future<void> _submit(SearchQuery query) async {
    // « Autour de moi » : la position doit être connue pour trier.
    if (query.sort == SearchSort.nearest) await sl<LocationController>().refresh(ask: true);
    final cubit = sl<SearchCubit>();
    cubit.search(query);
    if (mounted) context.router.push(const DiscoverRoute());
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppTopBar(title: 'search.title'.tr()),
    body: SearchForm(cities: _cities, initial: const SearchQuery(), onSubmit: _submit),
  );
}

/// Corps de la recherche, sans dépendance : testable seul.
class SearchForm extends StatefulWidget {
  const SearchForm({required this.cities, required this.initial, required this.onSubmit, super.key});
  final List<String> cities;
  final SearchQuery initial;
  final ValueChanged<SearchQuery> onSubmit;

  @override
  State<SearchForm> createState() => _SearchFormState();
}

enum _When { tonight, weekend, custom }

class _SearchFormState extends State<SearchForm> {
  late SearchQuery _query = widget.initial;
  final _field = TextEditingController();
  _When? _when;

  static const _types = ['studio', 'apartment', 'villa', 'duplex'];

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  List<String> get _suggestions {
    final needle = _field.text.trim().toLowerCase();
    if (needle.isEmpty) return const [];
    return widget.cities.where((c) => c.toLowerCase().contains(needle)).take(5).toList();
  }

  Future<void> _pickWhen(_When when) async {
    final now = DateTime.now();
    DateTime? arrival = switch (when) {
      _When.tonight => DateTime(now.year, now.month, now.day),
      _When.weekend => nextWeekend(now),
      _When.custom => null,
    };
    if (when == _When.custom) {
      arrival = await showDatePicker(
        context: context,
        firstDate: DateTime(now.year, now.month, now.day),
        lastDate: now.add(const Duration(days: 365)),
      );
      if (arrival == null) return;
    }
    setState(() {
      _when = when;
      _query = _query.copyWith(arrival: arrival);
    });
  }

  Future<void> _filters() async {
    final next = await showFiltersSheet(context, _query);
    if (next != null) setState(() => _query = next);
  }

  @override
  Widget build(BuildContext context) {
    final count = _query.activeFilterCount;
    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                TextField(
                  controller: _field,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: 'search.destination'.tr(),
                    prefixIcon: const Icon(LucideIcons.search, size: 18),
                  ),
                  onChanged: (_) => setState(() => _query = _query.copyWith(city: null)),
                ),
                ListTile(
                  leading: const Icon(LucideIcons.locateFixed, size: 18),
                  title: Text('search.near_me'.tr()),
                  subtitle: Text('search.near_me_hint'.tr()),
                  onTap: () => setState(() {
                    _field.text = 'search.near_me'.tr();
                    _query = _query.copyWith(city: null, sort: SearchSort.nearest);
                  }),
                ),
                for (final city in _suggestions)
                  ListTile(
                    leading: const Icon(LucideIcons.mapPin, size: 18),
                    title: Text(city),
                    onTap: () => setState(() {
                      _field.text = city;
                      _query = _query.copyWith(city: city);
                    }),
                  ),
                const SizedBox(height: 16),
                Text('search.when'.tr(), style: context.mutedText),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final w in _When.values)
                    AppChoiceChip(
                      label: switch (w) {
                        _When.tonight => 'search.tonight'.tr(),
                        _When.weekend => 'search.weekend'.tr(),
                        _When.custom => 'search.pick_date'.tr(),
                      },
                      icon: w == _When.custom ? LucideIcons.calendar : null,
                      selected: _when == w,
                      onTap: () => _pickWhen(w),
                    ),
                ]),
                const SizedBox(height: 16),
                Text('search.type'.tr(), style: context.mutedText),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final type in _types)
                    AppChoiceChip(
                      label: 'search.types.$type'.tr(),
                      selected: _query.propertyType == type,
                      onTap: () => setState(() => _query = _query.copyWith(
                        propertyType: _query.propertyType == type ? null : type,
                      )),
                    ),
                ]),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Row(children: [
              AppButton(
                label: count == 0 ? 'search.filters'.tr() : '${'search.filters'.tr()} · $count',
                icon: LucideIcons.slidersHorizontal,
                variant: AppButtonVariant.secondary,
                onPressed: _filters,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AppButton(
                  label: 'search.submit'.tr(),
                  expand: true,
                  onPressed: () => widget.onSubmit(_query),
                ),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}
```

`client/lib/features/search/presentation/widgets/filters_sheet.dart` :

```dart
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_typography.dart';
import '../../../../shared/utils/money.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_icon_button.dart';
import '../../../../shared/widgets/app_sheet.dart';
import '../../data/search_query.dart';

Future<SearchQuery?> showFiltersSheet(BuildContext context, SearchQuery query) =>
    showAppSheet<SearchQuery>(context: context, builder: (_) => _FiltersSheet(query));

class _FiltersSheet extends StatefulWidget {
  const _FiltersSheet(this.initial);
  final SearchQuery initial;
  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late SearchQuery _q = widget.initial;

  /// Bornes du curseur de budget, en francs par jour.
  static const _minBudget = 5000.0;
  static const _maxBudget = 200000.0;

  @override
  Widget build(BuildContext context) {
    final range = RangeValues(
      (_q.minPrice ?? _minBudget).toDouble(),
      (_q.maxPrice ?? _maxBudget).toDouble(),
    );
    return AppSheet(
      title: 'search.filters'.tr(),
      footer: Row(children: [
        AppButton(
          label: 'search.reset'.tr(),
          variant: AppButtonVariant.ghost,
          onPressed: () => setState(() => _q = _q.copyWith(
            minPrice: null, maxPrice: null, minBedrooms: null, minSurface: null,
            sort: SearchSort.recommended,
          )),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: AppButton(
            label: 'search.apply'.tr(),
            expand: true,
            onPressed: () => Navigator.of(context).pop(_q),
          ),
        ),
      ]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('search.budget'.tr(), style: context.mutedText),
          RangeSlider(
            values: range,
            min: _minBudget,
            max: _maxBudget,
            divisions: 39,
            labels: RangeLabels(formatFcfa(range.start.round()), formatFcfa(range.end.round())),
            onChanged: (v) => setState(() => _q = _q.copyWith(
              minPrice: v.start <= _minBudget ? null : v.start.round(),
              maxPrice: v.end >= _maxBudget ? null : v.end.round(),
            )),
          ),
          _Stepper(
            label: 'search.bedrooms'.tr(),
            value: _q.minBedrooms,
            unit: '',
            onChanged: (v) => setState(() => _q = _q.copyWith(minBedrooms: v)),
          ),
          _Stepper(
            label: 'search.surface'.tr(),
            value: _q.minSurface?.round(),
            step: 10,
            unit: ' m²',
            onChanged: (v) => setState(() => _q = _q.copyWith(minSurface: v?.toDouble())),
          ),
          const SizedBox(height: 12),
          Text('search.sort'.tr(), style: context.mutedText),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in SearchSort.values)
              AppChoiceChip(
                label: 'search.sorts.${s.name}'.tr(),
                selected: _q.sort == s,
                onTap: () => setState(() => _q = _q.copyWith(sort: s)),
              ),
          ]),
        ],
      ),
    );
  }
}

/// Compteur − / + ; `null` = indifférent.
class _Stepper extends StatelessWidget {
  const _Stepper({required this.label, required this.value, required this.onChanged, required this.unit, this.step = 1});
  final String label;
  final int? value;
  final int step;
  final String unit;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(children: [
      Expanded(child: Text(label)),
      AppIconButton(
        icon: LucideIcons.minus,
        label: '−',
        bordered: true,
        onPressed: value == null ? null : () => onChanged(value! - step <= 0 ? null : value! - step),
      ),
      SizedBox(
        width: 72,
        child: Text(
          value == null ? 'search.any'.tr() : '$value$unit',
          textAlign: TextAlign.center,
          style: context.text.titleSmall,
        ),
      ),
      AppIconButton(
        icon: LucideIcons.plus,
        label: '+',
        bordered: true,
        onPressed: () => onChanged((value ?? 0) + step),
      ),
    ]),
  );
}
```

`app_router.dart` : ajouter `AutoRoute(page: SearchRoute.page),`. Dans `explore_sheet.dart`, rétablir `onTap: () => context.router.push(const SearchRoute())`. `DiscoverRoute` arrive à la Task 9 : jusque-là, `_submit` lance la recherche et revient (`context.router.maybePop()`), à remplacer par `push(const DiscoverRoute())` à la Task 9.

- [ ] **Step 5 : vérifier**

Run: `cd client && dart run build_runner build --delete-conflicting-outputs && flutter test test/features/search && flutter analyze`
Expected: PASS, analyse propre.

- [ ] **Step 6 : commit (sur demande)**

```bash
git add pubspec.yaml assets lib test/features/search
git commit -m "feat(search): ecran ou sejourner et feuille de filtres"
```

---

### Task 9 : cartes à faire glisser et favoris

**Files:**
- Create: `client/lib/features/discover/presentation/widgets/swipe_deck.dart`
- Create: `client/lib/features/discover/presentation/widgets/swipe_card.dart`
- Create: `client/lib/features/discover/presentation/screens/discover_screen.dart`
- Create: `client/lib/features/discover/presentation/screens/results_map_screen.dart`
- Create: `client/lib/features/favorites/data/favorites_store.dart`
- Create: `client/lib/features/favorites/business_logic/favorites_cubit.dart`
- Create: `client/lib/features/favorites/presentation/screens/favorites_screen.dart`
- Modify: router, DI, tiroir (`FavoritesRoute`), `search_screen.dart` (`DiscoverRoute`), traductions
- Test: `client/test/features/discover/swipe_deck_test.dart`, `client/test/features/favorites/favorites_store_test.dart`

**Interfaces:**
- Consumes: `SearchCubit`/`SearchState`, `PropertyModel`, `formatFcfa`, `PropertiesMap`, `LocationController`, `distanceMeters`.
- Produces:
  - `enum SwipeDirection { left, right }` ; `class SwipeDeckController { void swipe(SwipeDirection) }` ; `SwipeDeck<T>({required List<T> items, required Widget Function(BuildContext, T) cardBuilder, required void Function(T, SwipeDirection) onSwiped, required WidgetBuilder emptyBuilder, VoidCallback? onNearEnd, SwipeDeckController? controller})`.
  - `SwipeCard({required PropertyModel property, required VoidCallback onOpen, double? distanceKm})`.
  - `FavoritesStore(SharedPreferences)` : `List<PropertyModel> read()`, `Future<void> write(List<PropertyModel>)`.
  - `FavoritesCubit extends Cubit<List<PropertyModel>>` : `add(PropertyModel)`, `toggle(PropertyModel)`, `bool contains(String id)`.
  - Routes `DiscoverRoute`, `ResultsMapRoute`, `FavoritesRoute`.

- [ ] **Step 1 : traductions**

`fr.json` :

```json
"discover": {
  "results": "{count} résultats",
  "nope": "NON",
  "like": "J'AIME",
  "all_seen": "Vous avez tout vu",
  "all_seen_hint": "Élargissez la recherche pour découvrir d'autres résidences.",
  "edit_search": "Modifier la recherche",
  "empty": "Aucune résidence ne correspond à ces critères.",
  "map": "Voir sur la carte",
  "pass": "Passer",
  "open": "Voir la fiche",
  "km": "{value} km"
},
"favorites": {
  "title": "Mes favoris",
  "empty": "Les résidences que vous aimez apparaîtront ici.",
  "added": "Ajoutée à vos favoris"
}
```

`en.json` :

```json
"discover": {
  "results": "{count} results",
  "nope": "NOPE",
  "like": "LIKE",
  "all_seen": "You've seen them all",
  "all_seen_hint": "Broaden your search to discover more residences.",
  "edit_search": "Edit search",
  "empty": "No residence matches these criteria.",
  "map": "View on map",
  "pass": "Pass",
  "open": "View details",
  "km": "{value} km"
},
"favorites": {
  "title": "My favorites",
  "empty": "Residences you like will show up here.",
  "added": "Added to your favorites"
}
```

- [ ] **Step 2 : écrire les tests qui échouent**

`client/test/features/discover/swipe_deck_test.dart` :

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/features/discover/presentation/widgets/swipe_deck.dart';

Widget _deck(List<(int, SwipeDirection)> swiped, {SwipeDeckController? controller}) => MaterialApp(
  home: Scaffold(
    body: SizedBox(
      width: 400,
      height: 600,
      child: SwipeDeck<int>(
        items: const [1, 2],
        controller: controller,
        cardBuilder: (_, i) => SizedBox.expand(key: ValueKey('card-$i'), child: Text('$i')),
        emptyBuilder: (_) => const Text('fin'),
        onSwiped: (i, d) => swiped.add((i, d)),
      ),
    ),
  ),
);

void main() {
  testWidgets('glissé lentement au-delà du seuil : choix enregistré', (tester) async {
    final swiped = <(int, SwipeDirection)>[];
    await tester.pumpWidget(_deck(swiped));

    await tester.timedDrag(find.byKey(const ValueKey('card-1')), const Offset(-200, 0), const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(swiped, [(1, SwipeDirection.left)]);
    expect(find.byKey(const ValueKey('card-2')), findsOneWidget);
  });

  testWidgets('en deçà du seuil : la carte revient', (tester) async {
    final swiped = <(int, SwipeDirection)>[];
    await tester.pumpWidget(_deck(swiped));

    await tester.timedDrag(find.byKey(const ValueKey('card-1')), const Offset(60, 0), const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(swiped, isEmpty);
    expect(tester.getTopLeft(find.byKey(const ValueKey('card-1'))).dx, closeTo(0, 1));
  });

  testWidgets('geste vif mais court : compte comme un choix', (tester) async {
    final swiped = <(int, SwipeDirection)>[];
    await tester.pumpWidget(_deck(swiped));

    await tester.fling(find.byKey(const ValueKey('card-1')), const Offset(80, 0), 1500);
    await tester.pumpAndSettle();

    expect(swiped, [(1, SwipeDirection.right)]);
  });

  testWidgets('les boutons jouent le même choix, puis l’état final s’affiche', (tester) async {
    final swiped = <(int, SwipeDirection)>[];
    final controller = SwipeDeckController();
    await tester.pumpWidget(_deck(swiped, controller: controller));

    controller.swipe(SwipeDirection.right);
    await tester.pumpAndSettle();
    controller.swipe(SwipeDirection.left);
    await tester.pumpAndSettle();

    expect(swiped, [(1, SwipeDirection.right), (2, SwipeDirection.left)]);
    expect(find.text('fin'), findsOneWidget);
  });
}
```

`client/test/features/favorites/favorites_store_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/features/favorites/business_logic/favorites_cubit.dart';
import 'package:resi_client/features/favorites/data/favorites_store.dart';
import 'package:resi_client/features/property/data/models/property_model.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('un favori survit au redémarrage, et se retire', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final villa = PropertyModel.fromJson({'id': 'p1', 'title': 'Villa'});

    final cubit = FavoritesCubit(FavoritesStore(prefs));
    await cubit.add(villa);
    await cubit.add(villa); // doublon ignoré

    final again = FavoritesCubit(FavoritesStore(prefs));
    expect(again.state.map((p) => p.title), ['Villa']);

    await again.toggle(villa);
    expect(FavoritesCubit(FavoritesStore(prefs)).state, isEmpty);
  });
}
```

- [ ] **Step 3 : vérifier l'échec**

Run: `cd client && flutter test test/features/discover test/features/favorites`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 4 : implémenter la pile**

`client/lib/features/discover/presentation/widgets/swipe_deck.dart` :

```dart
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

enum SwipeDirection { left, right }

/// Déclenche un choix depuis les boutons, avec la même animation qu'un geste.
class SwipeDeckController {
  _SwipeDeckState? _state;
  void swipe(SwipeDirection direction) => _state?._swipe(direction);
}

/// Pile de cartes à faire glisser, gestes faits à la main.
///
/// La carte suit le doigt et s'incline ; lâchée au-delà du seuil — en
/// distance **ou** en vitesse —, elle part avec l'élan, sinon elle revient en
/// ressort. Sans paquet tiers : le ressenti (seuils, ressort, haptique) se
/// règle ici.
class SwipeDeck<T> extends StatefulWidget {
  const SwipeDeck({
    required this.items,
    required this.cardBuilder,
    required this.onSwiped,
    required this.emptyBuilder,
    this.onNearEnd,
    this.controller,
    this.stampBuilder,
    super.key,
  });

  final List<T> items;
  final Widget Function(BuildContext context, T item) cardBuilder;
  final void Function(T item, SwipeDirection direction) onSwiped;
  final WidgetBuilder emptyBuilder;

  /// Appelé quand il reste [nearEndCount] cartes : charger la page suivante.
  final VoidCallback? onNearEnd;
  final SwipeDeckController? controller;

  /// Tampon affiché sur la carte pendant le geste ; [opacity] de 0 à 1.
  final Widget Function(BuildContext context, SwipeDirection direction, double opacity)? stampBuilder;

  /// Fraction de la largeur au-delà de laquelle un glissé vaut un choix.
  static const thresholdFraction = 0.3;

  /// Vitesse (px/s) au-delà de laquelle un geste court vaut un choix.
  static const flingVelocity = 800.0;
  static const nearEndCount = 5;

  @override
  State<SwipeDeck<T>> createState() => _SwipeDeckState<T>();
}

class _SwipeDeckState<T> extends State<SwipeDeck<T>> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController.unbounded(vsync: this)
    ..addListener(_tick);
  Animation<Offset>? _anim;
  Offset _offset = Offset.zero;
  int _index = 0;
  bool _pastThreshold = false;
  double _width = 1;

  bool get _animating => _ctrl.isAnimating;

  @override
  void initState() {
    super.initState();
    widget.controller?._state = this;
  }

  @override
  void didUpdateWidget(SwipeDeck<T> old) {
    super.didUpdateWidget(old);
    widget.controller?._state = this;
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _tick() {
    final anim = _anim;
    if (anim != null) setState(() => _offset = anim.value);
  }

  void _runTo(Offset target, {required bool spring, VoidCallback? then}) {
    _anim = _ctrl.drive(Tween<Offset>(begin: _offset, end: target));
    _ctrl.value = 0;
    final run = spring
        ? _ctrl.animateWith(SpringSimulation(
            const SpringDescription(mass: 1, stiffness: 420, damping: 28), 0, 1, 0))
        : _ctrl.animateTo(1, duration: const Duration(milliseconds: 240), curve: Curves.easeOutCubic);
    run.whenCompleteOrCancel(() {
      _anim = null;
      then?.call();
    });
  }

  void _onPanUpdate(DragUpdateDetails d) {
    if (_animating) return;
    setState(() => _offset += d.delta);
    final past = _offset.dx.abs() > _width * SwipeDeck.thresholdFraction;
    if (past != _pastThreshold) {
      _pastThreshold = past;
      // Haptique au franchissement : le doigt sent qu'il peut lâcher.
      if (past) HapticFeedback.selectionClick();
    }
  }

  void _onPanEnd(DragEndDetails d) {
    if (_animating) return;
    final vx = d.velocity.pixelsPerSecond.dx;
    final far = _offset.dx.abs() > _width * SwipeDeck.thresholdFraction;
    final fast = vx.abs() > SwipeDeck.flingVelocity;
    _pastThreshold = false;
    if (far || fast) {
      final direction = (fast ? vx : _offset.dx) > 0 ? SwipeDirection.right : SwipeDirection.left;
      _swipe(direction);
    } else {
      _runTo(Offset.zero, spring: true);
    }
  }

  void _swipe(SwipeDirection direction) {
    if (_animating || _index >= widget.items.length) return;
    final sign = direction == SwipeDirection.right ? 1 : -1;
    _runTo(Offset(sign * _width * 1.5, _offset.dy + 40), spring: false, then: () {
      if (!mounted) return;
      final item = widget.items[_index];
      setState(() {
        _index++;
        _offset = Offset.zero;
      });
      widget.onSwiped(item, direction);
      if (widget.items.length - _index <= SwipeDeck.nearEndCount) widget.onNearEnd?.call();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_index >= widget.items.length) return widget.emptyBuilder(context);

    return LayoutBuilder(builder: (context, constraints) {
      _width = constraints.maxWidth;
      final progress = (_offset.dx.abs() / (_width * SwipeDeck.thresholdFraction)).clamp(0.0, 1.0);
      final stampOpacity = ((progress - 0.3) / 0.7).clamp(0.0, 1.0);
      final angle = (_offset.dx / _width) * 0.35;
      final hasNext = _index + 1 < widget.items.length;

      return Stack(
        children: [
          if (hasNext)
            Positioned.fill(
              child: Transform.scale(
                // La carte suivante remonte à mesure que la première s'en va.
                scale: 0.95 + 0.05 * progress,
                child: widget.cardBuilder(context, widget.items[_index + 1]),
              ),
            ),
          Positioned.fill(
            child: GestureDetector(
              onPanUpdate: _onPanUpdate,
              onPanEnd: _onPanEnd,
              child: Transform.translate(
                offset: _offset,
                child: Transform.rotate(
                  angle: angle,
                  alignment: Alignment.bottomCenter,
                  child: Stack(
                    children: [
                      Positioned.fill(child: widget.cardBuilder(context, widget.items[_index])),
                      if (widget.stampBuilder != null && _offset.dx != 0)
                        Positioned.fill(
                          child: IgnorePointer(
                            child: widget.stampBuilder!(
                              context,
                              _offset.dx > 0 ? SwipeDirection.right : SwipeDirection.left,
                              stampOpacity,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    });
  }
}
```

`client/lib/features/discover/presentation/widgets/swipe_card.dart` :

```dart
import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../../shared/utils/money.dart';
import '../../../../shared/widgets/app_badge.dart';
import '../../../property/data/models/property_model.dart';

/// Carte photo plein cadre. Toucher le tiers gauche ou droit fait défiler les
/// photos ; le centre ouvre la fiche.
class SwipeCard extends StatefulWidget {
  const SwipeCard({required this.property, required this.onOpen, this.distanceKm, super.key});
  final PropertyModel property;
  final VoidCallback onOpen;
  final double? distanceKm;

  @override
  State<SwipeCard> createState() => _SwipeCardState();
}

class _SwipeCardState extends State<SwipeCard> {
  int _photo = 0;

  void _onTapUp(TapUpDetails d, double width) {
    final images = widget.property.images;
    final x = d.localPosition.dx;
    if (x < width / 3 && _photo > 0) {
      setState(() => _photo--);
    } else if (x > width * 2 / 3 && _photo < images.length - 1) {
      setState(() => _photo++);
    } else {
      widget.onOpen();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final p = widget.property;
    final onPhoto = TextStyle(color: t.onOverlay);

    return LayoutBuilder(builder: (context, constraints) => GestureDetector(
      onTapUp: (d) => _onTapUp(d, constraints.maxWidth),
      child: ClipRRect(
        borderRadius: AppRadius.lg,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (p.images.isEmpty)
              ColoredBox(color: t.border)
            else
              CachedNetworkImage(imageUrl: p.images[_photo], fit: BoxFit.cover),
            // Voile sombre en pied de photo : le texte reste lisible sur toute
            // image, en clair comme en sombre (`tokens.overlay`).
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.center,
                  end: Alignment.bottomCenter,
                  colors: [t.overlay.withValues(alpha: 0), t.overlay.withValues(alpha: 0.72)],
                ),
              ),
            ),
            if (p.images.length > 1)
              Positioned(
                top: 10, left: 10, right: 10,
                child: Row(children: [
                  for (var i = 0; i < p.images.length; i++)
                    Expanded(
                      child: Container(
                        height: 3,
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        decoration: BoxDecoration(
                          color: t.onOverlay.withValues(alpha: i == _photo ? 1 : 0.45),
                          borderRadius: AppRadius.pill,
                        ),
                      ),
                    ),
                ]),
              ),
            Positioned(
              left: 16, right: 16, bottom: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (p.featured) AppBadge(label: 'explore.featured'.tr()),
                  const SizedBox(height: 6),
                  Text(p.title, style: context.text.titleLarge!.merge(onPhoto)),
                  Text(
                    [
                      p.city,
                      if (p.bedrooms > 0) '${p.bedrooms} ch.',
                      if (widget.distanceKm != null)
                        'discover.km'.tr(namedArgs: {'value': widget.distanceKm!.toStringAsFixed(1)}),
                    ].join(' · '),
                    style: context.text.bodyMedium!.merge(onPhoto),
                  ),
                  const SizedBox(height: 6),
                  Text.rich(TextSpan(children: [
                    TextSpan(text: formatFcfa(p.dailyPrice), style: context.text.titleMedium!.merge(onPhoto)),
                    TextSpan(text: ' ${'explore.per_day'.tr()}', style: context.text.bodySmall!.merge(onPhoto)),
                  ])),
                ],
              ),
            ),
          ],
        ),
      ),
    ));
  }
}
```

Le dégradé est ici le voile photo prévu par le thème (`tokens.overlay`) — la seule exception à « pas de dégradé ».

- [ ] **Step 5 : favoris**

`client/lib/features/favorites/data/favorites_store.dart` :

```dart
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../property/data/models/property_model.dart';

/// Favoris sur le téléphone, résidence entière gardée : la liste s'affiche
/// sans requête. Pas de route API au lot 1 ; une synchronisation viendra.
class FavoritesStore {
  FavoritesStore(this._prefs);
  final SharedPreferences _prefs;
  static const _key = 'favorite_properties';

  List<PropertyModel> read() {
    final raw = _prefs.getString(_key);
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((e) => PropertyModel.fromJson(e.cast<String, dynamic>()))
          .toList();
    } catch (_) {
      // Format illisible d'une version antérieure : on repart d'une liste vide.
      return const [];
    }
  }

  Future<void> write(List<PropertyModel> items) =>
      _prefs.setString(_key, jsonEncode(items.map((p) => p.toJson()).toList()));
}
```

`client/lib/features/favorites/business_logic/favorites_cubit.dart` :

```dart
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../property/data/models/property_model.dart';
import '../data/favorites_store.dart';

class FavoritesCubit extends Cubit<List<PropertyModel>> {
  FavoritesCubit(this._store) : super(_store.read());
  final FavoritesStore _store;

  bool contains(String id) => state.any((p) => p.id == id);

  Future<void> add(PropertyModel property) async {
    if (contains(property.id)) return;
    await _save([property, ...state]);
  }

  Future<void> toggle(PropertyModel property) async => contains(property.id)
      ? _save(state.where((p) => p.id != property.id).toList())
      : add(property);

  Future<void> _save(List<PropertyModel> items) async {
    emit(items);
    await _store.write(items);
  }
}
```

`client/lib/features/favorites/presentation/screens/favorites_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/router/app_router.gr.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../../shared/widgets/app_top_bar.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../explore/presentation/widgets/featured_card.dart';
import '../../../property/data/models/property_model.dart';
import '../../business_logic/favorites_cubit.dart';

@RoutePage()
class FavoritesScreen extends StatelessWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppTopBar(title: 'favorites.title'.tr()),
    body: BlocBuilder<FavoritesCubit, List<PropertyModel>>(
      bloc: sl<FavoritesCubit>(),
      builder: (context, items) => items.isEmpty
          ? EmptyState(icon: AppSectionIcons.favorites, message: 'favorites.empty'.tr())
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.84,
              ),
              itemCount: items.length,
              itemBuilder: (_, i) => FeaturedCard(
                property: items[i],
                onTap: () => context.router.push(
                  PropertyDetailRoute(propertyId: items[i].id, initial: items[i]),
                ),
              ),
            ),
    ),
  );
}
```

(`PropertyDetailRoute` arrive à la Task 10 : laisser `onTap: () {}` avec un commentaire `// Task 10` d'ici là.)

- [ ] **Step 6 : écran de découverte**

`client/lib/features/discover/presentation/screens/discover_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/location/geo_point.dart';
import '../../../../core/location/location_controller.dart';
import '../../../../core/router/app_router.gr.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../../shared/widgets/app_icon_button.dart';
import '../../../../shared/widgets/app_loader.dart';
import '../../../../shared/widgets/app_toast.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/error_state.dart';
import '../../../favorites/business_logic/favorites_cubit.dart';
import '../../../property/data/models/property_model.dart';
import '../../../search/business_logic/search_cubit.dart';
import '../../../search/business_logic/search_state.dart';
import '../widgets/swipe_card.dart';
import '../widgets/swipe_deck.dart';

@RoutePage()
class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key});
  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  final _deck = SwipeDeckController();

  void _open(PropertyModel p) =>
      context.router.push(PropertyDetailRoute(propertyId: p.id, initial: p));

  void _onSwiped(PropertyModel p, SwipeDirection d) {
    if (d == SwipeDirection.right) {
      sl<FavoritesCubit>().add(p);
      AppToast.success('favorites.added'.tr());
    }
  }

  double? _distanceKm(PropertyModel p) {
    final me = sl<LocationController>().value;
    if (me == null || !p.hasLocation) return null;
    return distanceMeters(me, GeoPoint(p.latitude!, p.longitude!)) / 1000;
  }

  @override
  Widget build(BuildContext context) {
    final search = sl<SearchCubit>();
    return Scaffold(
      body: SafeArea(
        child: BlocBuilder<SearchCubit, SearchState>(
          bloc: search,
          builder: (context, state) => Column(
            children: [
              _TopBar(state: state),
              Expanded(child: switch (state) {
                SearchInitial() || SearchLoading() => const Center(child: AppLoader()),
                SearchError(:final message) => ErrorState(message: message, onRetry: search.retry),
                SearchLoaded(:final items) when items.isEmpty =>
                  EmptyState(icon: LucideIcons.searchX, message: 'discover.empty'.tr()),
                SearchLoaded(:final items, :final query) => Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: SwipeDeck<PropertyModel>(
                    // Nouvelle recherche : nouvelle pile, repartie de la première carte.
                    key: ValueKey(query),
                    items: items,
                    controller: _deck,
                    onSwiped: _onSwiped,
                    onNearEnd: search.loadMore,
                    cardBuilder: (_, p) => SwipeCard(property: p, distanceKm: _distanceKm(p), onOpen: () => _open(p)),
                    stampBuilder: (context, d, opacity) => _Stamp(direction: d, opacity: opacity),
                    emptyBuilder: (_) => EmptyState(
                      icon: LucideIcons.partyPopper,
                      title: 'discover.all_seen'.tr(),
                      message: 'discover.all_seen_hint'.tr(),
                      actionLabel: 'discover.edit_search'.tr(),
                      onAction: () => context.router.maybePop(),
                    ),
                  ),
                ),
              }),
              if (state is SearchLoaded && state.items.isNotEmpty) _Buttons(deck: _deck, onOpen: () {
                // Le bouton → ouvre la carte du dessus : la pile la connaît.
                final s = search.state;
                if (s is SearchLoaded) _deck.openTop(s.items, _open);
              }),
            ],
          ),
        ),
      ),
    );
  }
}
```

Pour que → ouvre la carte du dessus, ajouter à `SwipeDeckController` :

```dart
  /// Ouvre l'élément du dessus de la pile, s'il en reste un.
  void openTop<T>(List<T> items, void Function(T) open) {
    final index = _state?._index;
    if (index != null && index < items.length) open(items[index]);
  }
```

et dans le même fichier, les widgets de l'écran :

```dart
class _TopBar extends StatelessWidget {
  const _TopBar({required this.state});
  final SearchState state;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final label = switch (state) {
      SearchLoaded(:final query, :final meta) =>
        [if (query.city != null) query.city!, 'discover.results'.tr(namedArgs: {'count': '${meta.total}'})].join(' · '),
      _ => '',
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      child: Row(children: [
        AppIconButton(icon: LucideIcons.arrowLeft, label: 'common.back'.tr(), onPressed: () => context.router.maybePop()),
        Expanded(
          child: Center(
            child: DecoratedBox(
              decoration: BoxDecoration(border: Border.all(color: t.border), borderRadius: AppRadius.pill),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Text(label, style: context.text.labelMedium),
              ),
            ),
          ),
        ),
        AppIconButton(
          icon: LucideIcons.map,
          label: 'discover.map'.tr(),
          onPressed: () => context.router.push(const ResultsMapRoute()),
        ),
      ]),
    );
  }
}

class _Buttons extends StatelessWidget {
  const _Buttons({required this.deck, required this.onOpen});
  final SwipeDeckController deck;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    Widget round(IconData icon, String label, VoidCallback onTap, {double size = 56, Color? fg, Color? bg}) => Semantics(
      button: true,
      label: label,
      child: Material(
        color: bg ?? t.surface,
        shape: CircleBorder(side: BorderSide(color: bg ?? t.border)),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox.square(dimension: size, child: Icon(icon, color: fg ?? t.foreground)),
        ),
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          round(LucideIcons.x, 'discover.pass'.tr(), () => deck.swipe(SwipeDirection.left), fg: t.muted),
          const SizedBox(width: 20),
          round(LucideIcons.heart, 'discover.like'.tr(), () => deck.swipe(SwipeDirection.right), size: 66, fg: t.accentRed),
          const SizedBox(width: 20),
          round(LucideIcons.arrowRight, 'discover.open'.tr(), onOpen, fg: t.primaryForeground, bg: t.primary),
        ],
      ),
    );
  }
}

class _Stamp extends StatelessWidget {
  const _Stamp({required this.direction, required this.opacity});
  final SwipeDirection direction;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final like = direction == SwipeDirection.right;
    return Opacity(
      opacity: opacity,
      child: Align(
        alignment: like ? const Alignment(-0.8, -0.85) : const Alignment(0.8, -0.85),
        child: Transform.rotate(
          angle: like ? -0.2 : 0.2,
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border.all(color: t.onOverlay, width: 2.5),
              borderRadius: AppRadius.xs,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
              child: Text(
                (like ? 'discover.like' : 'discover.nope').tr(),
                style: context.text.titleLarge!.copyWith(color: t.onOverlay, letterSpacing: 1.5),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
```

`client/lib/features/discover/presentation/screens/results_map_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/location/geo_point.dart';
import '../../../../core/location/location_controller.dart';
import '../../../../core/router/app_router.gr.dart';
import '../../../../shared/widgets/app_top_bar.dart';
import '../../../../shared/widgets/properties_map.dart';
import '../../../search/business_logic/search_cubit.dart';
import '../../../search/business_logic/search_state.dart';

/// Les résultats de la recherche en cours, sur la carte.
@RoutePage()
class ResultsMapScreen extends StatelessWidget {
  const ResultsMapScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppTopBar(title: 'discover.map'.tr()),
    body: BlocBuilder<SearchCubit, SearchState>(
      bloc: sl<SearchCubit>(),
      builder: (context, state) {
        final items = state is SearchLoaded ? state.items : const [];
        final located = items.where((p) => p.hasLocation).toList();
        final center = located.isNotEmpty
            ? GeoPoint(located.first.latitude!, located.first.longitude!)
            : (sl<LocationController>().value ?? abidjan);
        return PropertiesMap(
          properties: List.of(items),
          center: center,
          onSelect: (p) => context.router.push(PropertyDetailRoute(propertyId: p.id, initial: p)),
        );
      },
    ),
  );
}
```

`PropertyDetailRoute` (Task 10) : comme ailleurs, `() {}` + commentaire d'ici là.

- [ ] **Step 7 : routes, DI, branchements**

`app_router.dart` : ajouter `AutoRoute(page: DiscoverRoute.page)`, `AutoRoute(page: ResultsMapRoute.page)`, `AutoRoute(page: FavoritesRoute.page)`.
`service_locator.dart` : `sl.registerLazySingleton(() => FavoritesCubit(FavoritesStore(sl())));` (singleton : la pile, la fiche et la liste partagent les mêmes favoris).
`search_screen.dart` : `_submit` pousse `const DiscoverRoute()`.
`app_drawer.dart` : décommenter l'entrée « Mes favoris ».

- [ ] **Step 8 : vérifier**

Run: `cd client && dart run build_runner build --delete-conflicting-outputs && flutter test && flutter analyze`
Expected: tout PASS, analyse propre.

- [ ] **Step 9 : commit (sur demande)**

```bash
git add lib assets/translations test
git commit -m "feat(discover): pile de cartes a glisser, carte des resultats et favoris"
```

---

### Task 10 : fiche d'une résidence

**Files:**
- Create: `client/lib/features/property/business_logic/property_detail_cubit.dart`, `property_detail_state.dart`
- Create: `client/lib/features/property/presentation/screens/property_detail_screen.dart`
- Create: `client/lib/features/property/presentation/widgets/amenity_icons.dart`
- Modify: router, DI, `explore_sheet.dart`, `favorites_screen.dart`, `results_map_screen.dart`, `discover_screen.dart` (rétablir `PropertyDetailRoute`), traductions
- Test: `client/test/features/property/property_detail_screen_test.dart`

**Interfaces:**
- Consumes: `PropertyRepository.show`, `FavoritesCubit`, `formatFcfa`, `PropertyModel`.
- Produces: route `PropertyDetailRoute({required String propertyId, PropertyModel? initial})` ; `PropertyDetailCubit` (`PropertyDetailLoading`, `PropertyDetailLoaded(property, {refreshing})`, `PropertyDetailError(message)`) ; `PropertyDetailView({required PropertyModel property, required VoidCallback onReserve, required bool isFavorite, required VoidCallback onToggleFavorite})` ; `IconData amenityIcon(String key)`. Le bouton « Réserver » appelle `onReserve`, branché sur la feuille de la Task 11.

- [ ] **Step 1 : traductions**

`fr.json` :

```json
"property": {
  "bedrooms": "ch.",
  "bathrooms": "sdb",
  "surface": "m²",
  "amenities": "Équipements",
  "description": "Description",
  "location": "Emplacement",
  "location_hint": "Position approximative ; l'adresse exacte vous est donnée après réservation.",
  "reserve": "Réserver",
  "types": {"studio": "Studio", "apartment": "Appartement", "villa": "Villa", "duplex": "Duplex"}
},
"amenities": {
  "air_conditioning": "Climatisation", "heating": "Chauffage", "elevator": "Ascenseur",
  "balcony": "Balcon", "terrace": "Terrasse", "garden": "Jardin", "pool": "Piscine",
  "gym": "Salle de sport", "security": "Gardiennage", "concierge": "Conciergerie",
  "wifi": "Wi-Fi", "parking": "Parking", "pet_friendly": "Animaux acceptés",
  "smoking_allowed": "Fumeurs acceptés"
}
```

`en.json` :

```json
"property": {
  "bedrooms": "bd",
  "bathrooms": "ba",
  "surface": "m²",
  "amenities": "Amenities",
  "description": "Description",
  "location": "Location",
  "location_hint": "Approximate location; the exact address is shared after booking.",
  "reserve": "Book",
  "types": {"studio": "Studio", "apartment": "Apartment", "villa": "Villa", "duplex": "Duplex"}
},
"amenities": {
  "air_conditioning": "Air conditioning", "heating": "Heating", "elevator": "Elevator",
  "balcony": "Balcony", "terrace": "Terrace", "garden": "Garden", "pool": "Pool",
  "gym": "Gym", "security": "Security", "concierge": "Concierge",
  "wifi": "Wi-Fi", "parking": "Parking", "pet_friendly": "Pets allowed",
  "smoking_allowed": "Smoking allowed"
}
```

- [ ] **Step 2 : écrire le test qui échoue**

`client/test/features/property/property_detail_screen_test.dart` :

```dart
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/theme/app_theme.dart';
import 'package:resi_client/features/property/data/models/property_model.dart';
import 'package:resi_client/features/property/presentation/screens/property_detail_screen.dart';

void main() {
  testWidgets('fiche : titre, prix, équipements, réserver ; aucun contact', (tester) async {
    var reserved = false;
    final property = PropertyModel.fromJson({
      'id': 'p1',
      'title': 'Villa Cocody Riviera',
      'address': {'city': 'Abidjan'},
      'details': {'bedrooms': 3, 'bathrooms': 2},
      'amenities': {'pool': true},
      'pricing': {'daily_price': 40000},
      'owner_phone': '+2250700000000',
    });

    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: PropertyDetailView(
        property: property,
        isFavorite: false,
        onToggleFavorite: () {},
        onReserve: () => reserved = true,
      ),
    ));

    expect(find.text('Villa Cocody Riviera'), findsOneWidget);
    expect(find.textContaining('40 000 F'), findsWidgets);
    expect(find.text('amenities.pool'.tr()), findsOneWidget);
    expect(find.textContaining('0700000000'), findsNothing);

    await tester.tap(find.text('property.reserve'.tr()));
    expect(reserved, isTrue);
  });
}
```

`PropertyDetailView` n'affiche pas de mini-carte en test : la carte est passée par un paramètre `map` optionnel (`Widget? map`) que l'écran fournit, la vue s'en passe.

- [ ] **Step 3 : vérifier l'échec**

Run: `cd client && flutter test test/features/property/property_detail_screen_test.dart`
Expected: FAIL — fichier introuvable.

- [ ] **Step 4 : implémenter**

`client/lib/features/property/presentation/widgets/amenity_icons.dart` :

```dart
import 'package:flutter/widgets.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

IconData amenityIcon(String key) => switch (key) {
  'air_conditioning' => LucideIcons.snowflake,
  'heating' => LucideIcons.flame,
  'elevator' => LucideIcons.arrowUpDown,
  'balcony' || 'terrace' => LucideIcons.sun,
  'garden' => LucideIcons.trees,
  'pool' => LucideIcons.waves,
  'gym' => LucideIcons.dumbbell,
  'security' => LucideIcons.shieldCheck,
  'concierge' => LucideIcons.bellRing,
  'wifi' => LucideIcons.wifi,
  'parking' => LucideIcons.squareParking,
  'pet_friendly' => LucideIcons.pawPrint,
  'smoking_allowed' => LucideIcons.cigarette,
  _ => LucideIcons.check,
};
```

`client/lib/features/property/business_logic/property_detail_state.dart` :

```dart
import '../data/models/property_model.dart';

sealed class PropertyDetailState {
  const PropertyDetailState();
}

final class PropertyDetailLoading extends PropertyDetailState {
  const PropertyDetailLoading();
}

final class PropertyDetailLoaded extends PropertyDetailState {
  const PropertyDetailLoaded(this.property);
  final PropertyModel property;
}

final class PropertyDetailError extends PropertyDetailState {
  const PropertyDetailError(this.message);
  final String message;
}
```

`client/lib/features/property/business_logic/property_detail_cubit.dart` :

```dart
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failures.dart';
import '../data/models/property_model.dart';
import '../data/repositories/property_repository.dart';
import 'property_detail_state.dart';

/// Fiche affichée aussitôt depuis la carte touchée ([initial]), puis
/// rafraîchie : prix et photos peuvent avoir changé depuis la liste.
class PropertyDetailCubit extends Cubit<PropertyDetailState> {
  PropertyDetailCubit(this._repo, {PropertyModel? initial})
    : super(initial == null ? const PropertyDetailLoading() : PropertyDetailLoaded(initial));

  final PropertyRepository _repo;

  Future<void> load(String id) async {
    try {
      final property = await _repo.show(id);
      if (!isClosed) emit(PropertyDetailLoaded(property));
    } on AppFailure catch (f) {
      // Déjà affichée depuis la liste : un échec du rafraîchissement ne
      // remplace pas une fiche lisible par un écran d'erreur.
      if (!isClosed && state is! PropertyDetailLoaded) emit(PropertyDetailError(f.userMessage));
    }
  }
}
```

`client/lib/features/property/presentation/screens/property_detail_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../../shared/utils/money.dart';
import '../../../../shared/widgets/app_badge.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_icon_button.dart';
import '../../../../shared/widgets/app_loader.dart';
import '../../../../shared/widgets/error_state.dart';
import '../../../../shared/widgets/frosted_surface.dart';
import '../../../favorites/business_logic/favorites_cubit.dart';
import '../../business_logic/property_detail_cubit.dart';
import '../../business_logic/property_detail_state.dart';
import '../../data/models/property_model.dart';
import '../widgets/amenity_icons.dart';

@RoutePage()
class PropertyDetailScreen extends StatelessWidget {
  const PropertyDetailScreen({required this.propertyId, this.initial, super.key});
  final String propertyId;
  final PropertyModel? initial;

  @override
  Widget build(BuildContext context) => BlocProvider(
    create: (_) => sl<PropertyDetailCubit>(param1: initial)..load(propertyId),
    child: BlocBuilder<PropertyDetailCubit, PropertyDetailState>(
      builder: (context, state) => switch (state) {
        PropertyDetailLoading() => const AppLoaderScreen(),
        PropertyDetailError(:final message) => Scaffold(
          body: ErrorState(message: message, onRetry: () => context.read<PropertyDetailCubit>().load(propertyId)),
        ),
        PropertyDetailLoaded(:final property) => BlocBuilder<FavoritesCubit, List<PropertyModel>>(
          bloc: sl<FavoritesCubit>(),
          builder: (context, _) => PropertyDetailView(
            property: property,
            isFavorite: sl<FavoritesCubit>().contains(property.id),
            onToggleFavorite: () => sl<FavoritesCubit>().toggle(property),
            // Task 11 : ouvre la feuille de réservation.
            onReserve: () {},
            map: property.hasLocation ? _MiniMap(property: property) : null,
          ),
        ),
      },
    ),
  );
}

class PropertyDetailView extends StatelessWidget {
  const PropertyDetailView({
    required this.property,
    required this.onReserve,
    required this.isFavorite,
    required this.onToggleFavorite,
    this.map,
    super.key,
  });

  final PropertyModel property;
  final VoidCallback onReserve;
  final bool isFavorite;
  final VoidCallback onToggleFavorite;
  final Widget? map;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final p = property;
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _Gallery(property: p, isFavorite: isFavorite, onToggleFavorite: onToggleFavorite)),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
            sliver: SliverList.list(children: [
              if (p.featured) Align(alignment: Alignment.centerLeft, child: AppBadge(label: 'explore.featured'.tr())),
              const SizedBox(height: 6),
              Text(p.title, style: context.text.headlineSmall),
              Text('${'property.types.${p.propertyType}'.tr()} · ${p.city}', style: context.mutedText),
              const SizedBox(height: 14),
              Row(children: [
                _Fact(value: '${p.bedrooms}', label: 'property.bedrooms'.tr()),
                const SizedBox(width: 8),
                _Fact(value: '${p.bathrooms}', label: 'property.bathrooms'.tr()),
                if (p.surfaceArea != null) ...[
                  const SizedBox(width: 8),
                  _Fact(value: '${p.surfaceArea!.round()}', label: 'property.surface'.tr()),
                ],
              ]),
              if (p.amenities.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('property.amenities'.tr(), style: context.text.titleMedium),
                const SizedBox(height: 8),
                Wrap(spacing: 16, runSpacing: 10, children: [
                  for (final a in p.amenities)
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(amenityIcon(a), size: 16, color: t.muted),
                      const SizedBox(width: 6),
                      Text('amenities.$a'.tr()),
                    ]),
                ]),
              ],
              if (p.description.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('property.description'.tr(), style: context.text.titleMedium),
                const SizedBox(height: 6),
                Text(p.description),
              ],
              if (map != null) ...[
                const SizedBox(height: 20),
                Text('property.location'.tr(), style: context.text.titleMedium),
                const SizedBox(height: 8),
                ClipRRect(borderRadius: AppRadius.md, child: SizedBox(height: 160, child: map)),
                const SizedBox(height: 6),
                Text('property.location_hint'.tr(), style: context.mutedText),
              ],
            ]),
          ),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(color: t.surface, border: Border(top: BorderSide(color: t.border))),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Row(children: [
              Expanded(
                child: Text.rich(TextSpan(children: [
                  TextSpan(text: formatFcfa(p.dailyPrice), style: context.text.titleLarge),
                  TextSpan(text: ' ${'explore.per_day'.tr()}', style: context.mutedText),
                ])),
              ),
              AppButton(label: 'property.reserve'.tr(), onPressed: onReserve),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Gallery extends StatefulWidget {
  const _Gallery({required this.property, required this.isFavorite, required this.onToggleFavorite});
  final PropertyModel property;
  final bool isFavorite;
  final VoidCallback onToggleFavorite;
  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final images = widget.property.images;
    return SizedBox(
      height: 300,
      child: Stack(children: [
        Positioned.fill(
          child: images.isEmpty
              ? ColoredBox(color: t.border)
              : PageView.builder(
                  itemCount: images.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (_, i) => CachedNetworkImage(imageUrl: images[i], fit: BoxFit.cover),
                ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              FrostedSurface(
                borderRadius: FrostedSurface.pill,
                child: AppIconButton(icon: LucideIcons.arrowLeft, label: 'common.back'.tr(),
                    onPressed: () => Navigator.of(context).maybePop()),
              ),
              const Spacer(),
              FrostedSurface(
                borderRadius: FrostedSurface.pill,
                child: AppIconButton(
                  icon: LucideIcons.heart,
                  label: 'nav.favorites'.tr(),
                  danger: widget.isFavorite,
                  onPressed: widget.onToggleFavorite,
                ),
              ),
            ]),
          ),
        ),
        if (images.length > 1)
          Positioned(
            bottom: 10, left: 0, right: 0,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 0; i < images.length; i++)
                Container(
                  width: 6, height: 6,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    color: t.onOverlay.withValues(alpha: i == _page ? 1 : 0.5),
                    borderRadius: AppRadius.pill,
                  ),
                ),
            ]),
          ),
      ]),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
    child: DecoratedBox(
      decoration: BoxDecoration(border: Border.all(color: context.tokens.border), borderRadius: AppRadius.md),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(children: [
          Text(value, style: context.text.titleMedium),
          Text(label, style: context.mutedText),
        ]),
      ),
    ),
  );
}

/// Mini-carte à position approximative : un cercle de 300 m plutôt qu'une
/// épingle, l'adresse exacte relevant de la réservation.
class _MiniMap extends StatelessWidget {
  const _MiniMap({required this.property});
  final PropertyModel property;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final center = LatLng(property.latitude!, property.longitude!);
    return GoogleMap(
      initialCameraPosition: CameraPosition(target: center, zoom: 14),
      liteModeEnabled: true,
      zoomControlsEnabled: false,
      scrollGesturesEnabled: false,
      zoomGesturesEnabled: false,
      circles: {
        Circle(
          circleId: const CircleId('zone'),
          center: center,
          radius: 300,
          strokeWidth: 1,
          strokeColor: t.foreground,
          fillColor: t.foreground.withValues(alpha: 0.08),
        ),
      },
    );
  }
}
```

`AppIconButton(danger: true)` colore l'icône en rouge (cœur plein). Si ce n'est pas son comportement (`grep -n danger lib/shared/widgets/app_icon_button.dart`), passer par un `Icon` coloré `t.accentRed`.

- [ ] **Step 5 : routes, DI, branchements**

`app_router.dart` : `AutoRoute(page: PropertyDetailRoute.page),`.
`service_locator.dart` :

```dart
  // La résidence touchée est passée à la création : la fiche s'affiche
  // aussitôt, puis se rafraîchit.
  sl.registerFactoryParam<PropertyDetailCubit, PropertyModel?, void>(
    (initial, _) => PropertyDetailCubit(sl(), initial: initial),
  );
```

Rétablir `context.router.push(PropertyDetailRoute(propertyId: …, initial: …))` dans `explore_sheet.dart`, `favorites_screen.dart`, `results_map_screen.dart`.

- [ ] **Step 6 : vérifier**

Run: `cd client && dart run build_runner build --delete-conflicting-outputs && flutter test && flutter analyze`
Expected: tout PASS, analyse propre.

- [ ] **Step 7 : commit (sur demande)**

```bash
git add lib assets/translations test/features/property
git commit -m "feat(property): fiche residence, galerie, equipements et position approximative"
```

---

### Task 11 : réservation et paiement Wave

**Files:**
- Modify: `client/pubspec.yaml` (url_launcher)
- Create: `client/lib/features/booking/data/models/booking_model.dart`
- Create: `client/lib/features/booking/data/repositories/booking_repository.dart`
- Create: `client/lib/features/booking/business_logic/booking_cubit.dart`, `booking_state.dart`
- Create: `client/lib/features/booking/presentation/widgets/stay_calendar.dart`
- Create: `client/lib/features/booking/presentation/widgets/booking_sheet.dart`
- Create: `client/lib/features/booking/presentation/screens/receipt_screen.dart`
- Modify: `property_detail_screen.dart` (`onReserve`), router, DI, traductions
- Test: `client/test/features/booking/booking_cubit_test.dart`, `client/test/features/booking/booking_model_test.dart`

**Interfaces:**
- Consumes: `calculateStayPrice`, `StayPrice`, `StayPriceException`, `occupiedDays`, `isRangeFree`, `dayOf`, `OccupiedPeriod` (Task 2), `PropertyRepository.availability` (Task 6), `requireSession` (Task 5), `formatFcfa`, `PropertyModel`.
- Produces:
  - `class BookingModel { String id, propertyId, status; DateTime startDate, endDate; int daysCount, dailyPrice, discountAmount, totalAmount; String? promoCode, paymentStatus; BookingPropertySummary? property; bool get isPaid; factory fromJson }`, `class BookingPropertySummary { String id, title, city; String? image }`.
  - `BookingRepository`: `create({required String propertyId, required DateTime start, required DateTime end, String? promoCode})`, `Future<String> initWave(String bookingId)`, `Future<String> confirmWave(String bookingId)` (rend le `status`), `Future<Page<BookingModel>> list({required int page})`.
  - `BookingCubit(BookingRepository, PropertyRepository, PropertyModel property, {Future<void> Function(Duration)? wait})` ; états `BookingDraft`, `BookingSubmitting`, `BookingAwaitingPayment(booking, paymentUrl)`, `BookingConfirming(booking)`, `BookingPaid(booking)`, `BookingUnverified(booking)`, `BookingPaymentFailed(booking, message)` ; méthodes `loadAvailability()`, `selectDates(DateTime start, DateTime? end)`, `setPromo(String?)`, `submit()`, `confirmPayment()`, `retryPayment()`.
  - `Future<void> showBookingSheet(BuildContext context, PropertyModel property)` ; route `ReceiptRoute({required BookingModel booking, required PropertyModel property})`.

- [ ] **Step 1 : dépendance et traductions**

`pubspec.yaml` :

```yaml
  # Ouvre l'application Wave sur le lien de paiement, hors de l'app : Wave
  # refuse d'être affiché dans une vue web intégrée.
  url_launcher: ^6.3.0
```

`fr.json` :

```json
"booking": {
  "title": "Vos dates",
  "pick_start": "Choisissez la date d'arrivée.",
  "pick_end": "Choisissez la date de départ.",
  "days": "{count} jours",
  "line": "{price} × {days} jours",
  "discount": "Remise de durée ({percent} %)",
  "promo": "Code promo",
  "promo_hint": "Appliqué au moment de payer",
  "total": "Total",
  "pay": "Payer avec Wave",
  "pay_amount": "Payer {amount} avec Wave",
  "amount_changed": "Montant final calculé par Resi : {amount}.",
  "open_wave": "Ouvrir Wave",
  "waiting": "Finalisez le paiement dans Wave, puis revenez ici.",
  "confirming": "Vérification du paiement…",
  "unverified": "Paiement en cours de vérification. Il apparaîtra dans vos réservations.",
  "payment_failed": "Le paiement n'a pas abouti.",
  "retry": "Réessayer le paiement",
  "wave_unavailable": "Impossible d'ouvrir Wave sur ce téléphone.",
  "invalid_dates": "La date de départ doit suivre la date d'arrivée.",
  "minimum_stay": "Séjour minimum : {count} jours.",
  "maximum_stay": "Séjour maximum : {count} jours.",
  "range_taken": "Ces dates chevauchent un séjour déjà réservé.",
  "receipt_title": "Réservation confirmée",
  "receipt_subtitle": "Paiement reçu par Wave",
  "paid": "Payé",
  "see_bookings": "Voir mes réservations"
}
```

`en.json` :

```json
"booking": {
  "title": "Your dates",
  "pick_start": "Pick your arrival date.",
  "pick_end": "Pick your departure date.",
  "days": "{count} days",
  "line": "{price} × {days} days",
  "discount": "Length-of-stay discount ({percent}%)",
  "promo": "Promo code",
  "promo_hint": "Applied at payment",
  "total": "Total",
  "pay": "Pay with Wave",
  "pay_amount": "Pay {amount} with Wave",
  "amount_changed": "Final amount computed by Resi: {amount}.",
  "open_wave": "Open Wave",
  "waiting": "Complete the payment in Wave, then come back here.",
  "confirming": "Checking the payment…",
  "unverified": "Payment being verified. It will appear in your bookings.",
  "payment_failed": "The payment did not go through.",
  "retry": "Retry payment",
  "wave_unavailable": "Wave cannot be opened on this phone.",
  "invalid_dates": "Departure must be after arrival.",
  "minimum_stay": "Minimum stay: {count} days.",
  "maximum_stay": "Maximum stay: {count} days.",
  "range_taken": "These dates overlap an existing booking.",
  "receipt_title": "Booking confirmed",
  "receipt_subtitle": "Payment received via Wave",
  "paid": "Paid",
  "see_bookings": "See my bookings"
}
```

Run: `cd client && flutter pub get`

- [ ] **Step 2 : écrire les tests qui échouent**

`client/test/features/booking/booking_model_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/features/booking/data/models/booking_model.dart';

void main() {
  test('lit une réservation de l’historique', () {
    final b = BookingModel.fromJson({
      'id': 'b1',
      'property_id': 'p1',
      'status': 'confirmed',
      'start_date': '2026-10-10T00:00:00.000Z',
      'end_date': '2026-10-12T00:00:00.000Z',
      'days_count': 2,
      'daily_price': 40000,
      'discount_amount': 0,
      'total_amount': 80000,
      'payment_status': 'success',
      'property': {'id': 'p1', 'title': 'Villa', 'city': 'Abidjan', 'image': null},
    });
    expect(b.totalAmount, 80000);
    expect(b.isPaid, isTrue);
    expect(b.property?.title, 'Villa');
  });

  test('ancienne réservation sans days_count : repli sur nights_count', () {
    final b = BookingModel.fromJson({
      'id': 'b2', 'property_id': 'p1', 'status': 'confirmed',
      'start_date': '2026-10-10T00:00:00.000Z', 'end_date': '2026-10-12T00:00:00.000Z',
      'nights_count': 2, 'total_amount': 80000,
    });
    expect(b.daysCount, 2);
    expect(b.paymentStatus, isNull);
    expect(b.isPaid, isFalse);
  });
}
```

`client/test/features/booking/booking_cubit_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/core/error/failures.dart';
import 'package:resi_client/features/booking/business_logic/booking_cubit.dart';
import 'package:resi_client/features/booking/business_logic/booking_state.dart';
import 'package:resi_client/features/booking/data/models/booking_model.dart';
import 'package:resi_client/features/booking/data/repositories/booking_repository.dart';
import 'package:resi_client/features/booking/domain/occupancy.dart';
import 'package:resi_client/features/property/data/models/property_model.dart';
import 'package:resi_client/features/property/data/repositories/property_repository.dart';

DateTime d(int day) => DateTime.utc(2026, 10, day);

final _property = PropertyModel.fromJson({
  'id': 'p1',
  'pricing': {'daily_price': 40000, 'minimum_stay_days': 1},
});

BookingModel _booking({int total = 80000}) => BookingModel.fromJson({
  'id': 'b1', 'property_id': 'p1', 'status': 'confirmed',
  'start_date': '2026-10-10T00:00:00.000Z', 'end_date': '2026-10-12T00:00:00.000Z',
  'days_count': 2, 'total_amount': total,
});

class _Bookings implements BookingRepository {
  AppFailure? createFailure;
  final statuses = <String>[];
  int inits = 0;

  @override
  Future<BookingModel> create({required String propertyId, required DateTime start, required DateTime end, String? promoCode}) async {
    if (createFailure != null) throw createFailure!;
    return _booking();
  }

  @override
  Future<String> initWave(String bookingId) async {
    inits++;
    return 'https://pay.wave.com/c/abc';
  }

  @override
  Future<String> confirmWave(String bookingId) async => statuses.isEmpty ? 'pending' : statuses.removeAt(0);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Properties implements PropertyRepository {
  int calls = 0;
  @override
  Future<List<OccupiedPeriod>> availability(String id) async {
    calls++;
    return [OccupiedPeriod(start: d(20), end: d(22))];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

BookingCubit _cubit(_Bookings b, _Properties p) =>
    BookingCubit(b, p, _property, wait: (_) async {});

void main() {
  test('dates choisies : estimation affichée', () async {
    final cubit = _cubit(_Bookings(), _Properties());
    await cubit.loadAvailability();
    cubit.selectDates(d(10), d(12));

    final s = cubit.state as BookingDraft;
    expect(s.estimate?.subtotal, 80000);
    expect(s.occupied, contains(d(20)));
  });

  test('plage traversant un séjour réservé : refusée avant l’envoi', () async {
    final cubit = _cubit(_Bookings(), _Properties());
    await cubit.loadAvailability();
    cubit.selectDates(d(19), d(23));

    final s = cubit.state as BookingDraft;
    expect(s.estimate, isNull);
    expect(s.end, isNull);
    expect(s.message, isNotNull);
  });

  test('création puis lien Wave', () async {
    final cubit = _cubit(_Bookings(), _Properties());
    cubit.selectDates(d(10), d(12));
    await cubit.submit();

    final s = cubit.state as BookingAwaitingPayment;
    expect(s.paymentUrl, 'https://pay.wave.com/c/abc');
    expect(s.booking.totalAmount, 80000);
  });

  test('409 à la création : disponibilité rechargée, dates à refaire', () async {
    final props = _Properties();
    final bookings = _Bookings()
      ..createFailure = AppFailure.serverError(code: 409, message: 'Dates déjà prises', businessCode: 'booking_period_conflict');
    final cubit = _cubit(bookings, props);
    cubit.selectDates(d(10), d(12));
    await cubit.submit();

    final s = cubit.state as BookingDraft;
    expect(s.end, isNull);
    expect(s.message, isNotNull);
    expect(props.calls, 1);
  });

  test('retour de Wave : payé après une tentative en attente', () async {
    final bookings = _Bookings()..statuses.addAll(['pending', 'success']);
    final cubit = _cubit(bookings, _Properties());
    cubit.selectDates(d(10), d(12));
    await cubit.submit();
    await cubit.confirmPayment();

    expect(cubit.state, isA<BookingPaid>());
  });

  test('toujours en attente : vérification en cours, sans boucle infinie', () async {
    final cubit = _cubit(_Bookings(), _Properties());
    cubit.selectDates(d(10), d(12));
    await cubit.submit();
    await cubit.confirmPayment();

    expect(cubit.state, isA<BookingUnverified>());
  });

  test('paiement expiré : échec, puis nouveau lien', () async {
    final bookings = _Bookings()..statuses.add('expired');
    final cubit = _cubit(bookings, _Properties());
    cubit.selectDates(d(10), d(12));
    await cubit.submit();
    await cubit.confirmPayment();
    expect(cubit.state, isA<BookingPaymentFailed>());

    await cubit.retryPayment();
    expect(cubit.state, isA<BookingAwaitingPayment>());
    expect(bookings.inits, 2);
  });
}
```

- [ ] **Step 3 : vérifier l'échec**

Run: `cd client && flutter test test/features/booking/booking_model_test.dart test/features/booking/booking_cubit_test.dart`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 4 : implémenter les données**

`client/lib/features/booking/data/models/booking_model.dart` :

```dart
/// Résumé du bien joint à l'historique du client (`property`).
class BookingPropertySummary {
  const BookingPropertySummary({required this.id, required this.title, required this.city, this.image});

  factory BookingPropertySummary.fromJson(Map<String, dynamic> json) => BookingPropertySummary(
    id: json['id'] as String,
    title: json['title'] as String? ?? '',
    city: json['city'] as String? ?? '',
    image: json['image'] as String?,
  );

  final String id;
  final String title;
  final String city;
  final String? image;
}

class BookingModel {
  const BookingModel({
    required this.id,
    required this.propertyId,
    required this.status,
    required this.startDate,
    required this.endDate,
    required this.daysCount,
    required this.dailyPrice,
    required this.discountAmount,
    required this.totalAmount,
    this.promoCode,
    this.paymentStatus,
    this.property,
  });

  factory BookingModel.fromJson(Map<String, dynamic> json) => BookingModel(
    id: json['id'] as String,
    propertyId: json['property_id'] as String,
    status: json['status'] as String? ?? 'confirmed',
    startDate: DateTime.parse(json['start_date'] as String),
    endDate: DateTime.parse(json['end_date'] as String),
    // `nights_count` : nom porté par les réservations enregistrées avant le
    // passage à une facturation en jours d'occupation.
    daysCount: ((json['days_count'] ?? json['nights_count']) as num?)?.toInt() ?? 0,
    dailyPrice: (json['daily_price'] as num?)?.round() ?? 0,
    discountAmount: (json['discount_amount'] as num?)?.round() ?? 0,
    totalAmount: (json['total_amount'] as num?)?.round() ?? 0,
    promoCode: json['promo_code'] as String?,
    // Absent d'une réponse de création, et de l'historique d'une API plus
    // ancienne : `null` se lit « paiement non lancé ».
    paymentStatus: json['payment_status'] as String?,
    property: json['property'] is Map
        ? BookingPropertySummary.fromJson((json['property'] as Map).cast<String, dynamic>())
        : null,
  );

  final String id;
  final String propertyId;

  /// `confirmed`, `in_progress`, `completed`, `cancelled`.
  final String status;
  final DateTime startDate;
  final DateTime endDate;
  final int daysCount;
  final int dailyPrice;
  final int discountAmount;
  final int totalAmount;
  final String? promoCode;

  /// `pending`, `success`, `failed`, `cancelled`, `expired` ou `null`.
  final String? paymentStatus;
  final BookingPropertySummary? property;

  bool get isPaid => paymentStatus == 'success';
}
```

`client/lib/features/booking/data/repositories/booking_repository.dart` :

```dart
import 'package:dio/dio.dart';

import '../../../../core/api/api_endpoints.dart';
import '../../../../core/error/failures.dart';
import '../../../../shared/models/page_meta.dart';
import '../models/booking_model.dart';

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class BookingRepository {
  BookingRepository(this._dio);
  final Dio _dio;

  Future<BookingModel> create({
    required String propertyId,
    required DateTime start,
    required DateTime end,
    String? promoCode,
  }) async {
    try {
      final res = await _dio.post(ApiEndpoints.createBooking(propertyId), data: {
        'start_date': _ymd(start),
        'end_date': _ymd(end),
        if (promoCode != null && promoCode.isNotEmpty) 'promo_code': promoCode,
      });
      return BookingModel.fromJson((res.data['data'] as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }

  /// Lien de paiement Wave ; l'API rend le lien en cours s'il en existe un.
  Future<String> initWave(String bookingId) async {
    try {
      final res = await _dio.post(ApiEndpoints.waveInit(bookingId));
      return res.data['payment_url'] as String;
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }

  /// Statut du paiement relu chez Wave par l'API.
  Future<String> confirmWave(String bookingId) async {
    try {
      final res = await _dio.post(ApiEndpoints.waveConfirm(bookingId));
      return res.data['data']['status'] as String;
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }

  Future<Page<BookingModel>> list({required int page}) async {
    try {
      final res = await _dio.get(ApiEndpoints.bookings, queryParameters: {'page': '$page'});
      final body = (res.data as Map).cast<String, dynamic>();
      return Page(
        items: (body['data'] as List)
            .whereType<Map>()
            .map((e) => BookingModel.fromJson(e.cast<String, dynamic>()))
            .toList(),
        meta: PageMeta.fromJson((body['meta'] as Map).cast<String, dynamic>()),
      );
    } on DioException catch (e) {
      throw AppFailure.fromDio(e);
    }
  }
}
```

- [ ] **Step 5 : implémenter l'état et le cubit**

`client/lib/features/booking/business_logic/booking_state.dart` :

```dart
import '../data/models/booking_model.dart';
import '../domain/stay_price.dart';

sealed class BookingState {
  const BookingState();
}

/// Saisie : dates, code promo, estimation.
final class BookingDraft extends BookingState {
  const BookingDraft({
    this.start,
    this.end,
    this.promoCode,
    this.occupied = const {},
    this.estimate,
    this.message,
  });

  final DateTime? start;
  final DateTime? end;
  final String? promoCode;
  final Set<DateTime> occupied;
  final StayPrice? estimate;

  /// Refus à afficher sous le calendrier (durée, chevauchement, 409).
  final String? message;

  bool get canSubmit => estimate != null;
}

final class BookingSubmitting extends BookingState {
  const BookingSubmitting();
}

final class BookingAwaitingPayment extends BookingState {
  const BookingAwaitingPayment(this.booking, this.paymentUrl);
  final BookingModel booking;
  final String paymentUrl;
}

final class BookingConfirming extends BookingState {
  const BookingConfirming(this.booking);
  final BookingModel booking;
}

final class BookingPaid extends BookingState {
  const BookingPaid(this.booking);
  final BookingModel booking;
}

/// Wave n'a pas encore tranché après plusieurs relectures.
final class BookingUnverified extends BookingState {
  const BookingUnverified(this.booking);
  final BookingModel booking;
}

final class BookingPaymentFailed extends BookingState {
  const BookingPaymentFailed(this.booking, this.message);
  final BookingModel booking;
  final String message;
}
```

`client/lib/features/booking/business_logic/booking_cubit.dart` :

```dart
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failures.dart';
import '../../property/data/models/property_model.dart';
import '../../property/data/repositories/property_repository.dart';
import '../data/models/booking_model.dart';
import '../data/repositories/booking_repository.dart';
import '../domain/occupancy.dart';
import '../domain/stay_price.dart';
import 'booking_state.dart';

class BookingCubit extends Cubit<BookingState> {
  BookingCubit(
    this._bookings,
    this._properties,
    this._property, {
    Future<void> Function(Duration)? wait,
  }) : _wait = wait ?? Future<void>.delayed,
       super(const BookingDraft());

  final BookingRepository _bookings;
  final PropertyRepository _properties;
  final PropertyModel _property;
  final Future<void> Function(Duration) _wait;

  /// Délais entre deux relectures du paiement : Wave met parfois quelques
  /// secondes à passer la session à `succeeded` après le retour du client.
  static const _confirmDelays = [
    Duration.zero,
    Duration(seconds: 2),
    Duration(seconds: 4),
    Duration(seconds: 8),
  ];

  BookingDraft get _draft => state is BookingDraft ? state as BookingDraft : const BookingDraft();

  Future<void> loadAvailability() async {
    try {
      final periods = await _properties.availability(_property.id);
      if (isClosed) return;
      final d = _draft;
      emit(BookingDraft(
        start: d.start, end: d.end, promoCode: d.promoCode,
        occupied: occupiedDays(periods), estimate: d.estimate, message: d.message,
      ));
    } on AppFailure {
      // Sans disponibilité, le serveur reste juge : un chevauchement rendra
      // un 409 à la création, traité plus bas.
    }
  }

  void selectDates(DateTime start, DateTime? end) {
    final d = _draft;
    if (end == null) {
      emit(BookingDraft(start: start, promoCode: d.promoCode, occupied: d.occupied));
      return;
    }
    if (!isRangeFree(start, end, d.occupied)) {
      emit(BookingDraft(start: start, promoCode: d.promoCode, occupied: d.occupied,
          message: 'booking.range_taken'.tr()));
      return;
    }
    try {
      final estimate = calculateStayPrice(
        dailyPrice: _property.dailyPrice,
        tiers: _property.priceTiers,
        minimumStayDays: _property.minimumStayDays,
        maximumStayDays: _property.maximumStayDays,
        start: start,
        end: end,
      );
      emit(BookingDraft(start: start, end: end, promoCode: d.promoCode, occupied: d.occupied, estimate: estimate));
    } on StayPriceException catch (e) {
      emit(BookingDraft(start: start, promoCode: d.promoCode, occupied: d.occupied, message: _priceMessage(e)));
    }
  }

  void setPromo(String? code) {
    final d = _draft;
    emit(BookingDraft(
      start: d.start, end: d.end, promoCode: code?.trim(), occupied: d.occupied,
      estimate: d.estimate, message: d.message,
    ));
  }

  Future<void> submit() async {
    final d = _draft;
    if (!d.canSubmit) return;
    emit(const BookingSubmitting());
    try {
      final booking = await _bookings.create(
        propertyId: _property.id,
        start: d.start!,
        end: d.end!,
        promoCode: d.promoCode,
      );
      final url = await _bookings.initWave(booking.id);
      if (!isClosed) emit(BookingAwaitingPayment(booking, url));
    } on AppFailure catch (f) {
      if (isClosed) return;
      // 409 : les dates viennent d'être prises par quelqu'un d'autre. On
      // recharge la disponibilité et on fait rechoisir la sortie.
      if (f.statusCode == 409) {
        emit(BookingDraft(start: d.start, promoCode: d.promoCode, occupied: d.occupied, message: f.userMessage));
        await loadAvailability();
        return;
      }
      emit(BookingDraft(
        start: d.start, end: d.end, promoCode: d.promoCode, occupied: d.occupied,
        estimate: d.estimate, message: f.userMessage,
      ));
    }
  }

  /// Appelé au retour de l'application Wave.
  Future<void> confirmPayment() async {
    final booking = switch (state) {
      BookingAwaitingPayment(:final booking) => booking,
      BookingUnverified(:final booking) => booking,
      _ => null,
    };
    if (booking == null) return;
    emit(BookingConfirming(booking));

    for (final delay in _confirmDelays) {
      await _wait(delay);
      if (isClosed) return;
      try {
        final status = await _bookings.confirmWave(booking.id);
        if (isClosed) return;
        if (status == 'success') return emit(BookingPaid(booking));
        if (status != 'pending') {
          return emit(BookingPaymentFailed(booking, 'booking.payment_failed'.tr()));
        }
      } on AppFailure {
        // Wave ou l'API injoignable : on retente au tour suivant, puis on
        // laisse l'historique trancher.
      }
    }
    if (!isClosed) emit(BookingUnverified(booking));
  }

  Future<void> retryPayment() async {
    final booking = switch (state) {
      BookingPaymentFailed(:final booking) => booking,
      BookingUnverified(:final booking) => booking,
      _ => null,
    };
    if (booking == null) return;
    try {
      final url = await _bookings.initWave(booking.id);
      if (!isClosed) emit(BookingAwaitingPayment(booking, url));
    } on AppFailure catch (f) {
      if (!isClosed) emit(BookingPaymentFailed(booking, f.userMessage));
    }
  }

  String _priceMessage(StayPriceException e) => switch (e.error) {
    StayPriceError.invalidDates => 'booking.invalid_dates'.tr(),
    StayPriceError.minimumStay => 'booking.minimum_stay'.tr(namedArgs: {'count': '${e.limit}'}),
    StayPriceError.maximumStay => 'booking.maximum_stay'.tr(namedArgs: {'count': '${e.limit}'}),
  };
}
```

Dans le test, `BookingDraft.end` est `null` après un refus : c'est voulu, le client rechoisit sa sortie. `BookingModel` est importé par l'état ; retirer l'import inutilisé du cubit si l'analyse le signale.

- [ ] **Step 6 : vérifier la logique**

Run: `cd client && flutter test test/features/booking/`
Expected: PASS (tous les tests de `booking/`, dont les 9 nouveaux).

- [ ] **Step 7 : calendrier, feuille, reçu**

`client/lib/features/booking/presentation/widgets/stay_calendar.dart` :

```dart
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../../shared/widgets/app_icon_button.dart';
import '../../domain/occupancy.dart';

/// Calendrier d'un mois : jours passés et occupés barrés, plage choisie en
/// deux touchers (arrivée, puis départ).
class StayCalendar extends StatefulWidget {
  const StayCalendar({required this.occupied, required this.start, required this.end, required this.onChanged, super.key});

  final Set<DateTime> occupied;
  final DateTime? start;
  final DateTime? end;
  final void Function(DateTime start, DateTime? end) onChanged;

  @override
  State<StayCalendar> createState() => _StayCalendarState();
}

class _StayCalendarState extends State<StayCalendar> {
  late DateTime _month = DateTime.utc(DateTime.now().year, DateTime.now().month);

  void _tap(DateTime day) {
    final s = widget.start;
    // Deuxième toucher après l'arrivée : c'est le départ ; sinon, nouvelle
    // arrivée. Le jour de départ peut être un jour occupé (sortie 12h).
    if (s != null && widget.end == null && day.isAfter(s)) {
      widget.onChanged(s, day);
    } else if (!widget.occupied.contains(day)) {
      widget.onChanged(day, null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final today = dayOf(DateTime.now());
    final first = _month;
    final daysInMonth = DateTime.utc(first.year, first.month + 1, 0).day;
    final leading = first.weekday - 1; // lundi en tête
    final locale = context.locale.toLanguageTag();

    return Column(children: [
      Row(children: [
        AppIconButton(
          icon: LucideIcons.chevronLeft,
          label: '‹',
          onPressed: first.isAfter(DateTime.utc(today.year, today.month))
              ? () => setState(() => _month = DateTime.utc(first.year, first.month - 1))
              : null,
        ),
        Expanded(
          child: Text(DateFormat.yMMMM(locale).format(first), textAlign: TextAlign.center,
              style: context.text.titleSmall),
        ),
        AppIconButton(
          icon: LucideIcons.chevronRight,
          label: '›',
          onPressed: () => setState(() => _month = DateTime.utc(first.year, first.month + 1)),
        ),
      ]),
      const SizedBox(height: 6),
      GridView.count(
        crossAxisCount: 7,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          for (var i = 0; i < leading; i++) const SizedBox.shrink(),
          for (var n = 1; n <= daysInMonth; n++)
            Builder(builder: (context) {
              final day = DateTime.utc(first.year, first.month, n);
              final past = day.isBefore(today);
              final taken = widget.occupied.contains(day);
              final s = widget.start, e = widget.end;
              final isEdge = day == s || day == e;
              final inside = s != null && e != null && day.isAfter(s) && day.isBefore(e);
              final disabled = past || (taken && !(s != null && e == null && day.isAfter(s)));
              return Padding(
                padding: const EdgeInsets.all(2),
                child: Material(
                  color: isEdge ? t.primary : inside ? t.border : t.surface,
                  shape: AppRadius.smShape,
                  child: InkWell(
                    customBorder: AppRadius.smShape,
                    onTap: disabled ? null : () => _tap(day),
                    child: Center(
                      child: Text(
                        '$n',
                        style: context.text.bodyMedium!.copyWith(
                          color: isEdge ? t.primaryForeground : disabled ? t.muted.withValues(alpha: 0.5) : t.foreground,
                          decoration: taken ? TextDecoration.lineThrough : null,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    ]);
  }
}
```

`client/lib/features/booking/presentation/widgets/booking_sheet.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/auth/require_session.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/router/app_router.gr.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../../shared/utils/money.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_callout.dart';
import '../../../../shared/widgets/app_loader.dart';
import '../../../../shared/widgets/app_sheet.dart';
import '../../../../shared/widgets/app_toast.dart';
import '../../../property/data/models/property_model.dart';
import '../../business_logic/booking_cubit.dart';
import '../../business_logic/booking_state.dart';
import 'stay_calendar.dart';

Future<void> showBookingSheet(BuildContext context, PropertyModel property) => showAppSheet<void>(
  context: context,
  builder: (_) => BlocProvider(
    create: (_) => sl<BookingCubit>(param1: property)..loadAvailability(),
    child: _BookingSheet(property: property),
  ),
);

class _BookingSheet extends StatefulWidget {
  const _BookingSheet({required this.property});
  final PropertyModel property;
  @override
  State<_BookingSheet> createState() => _BookingSheetState();
}

class _BookingSheetState extends State<_BookingSheet> with WidgetsBindingObserver {
  final _promo = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _promo.dispose();
    super.dispose();
  }

  /// Retour de l'application Wave : on fait constater le paiement.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) context.read<BookingCubit>().confirmPayment();
  }

  Future<void> _openWave(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok) AppToast.error('booking.wave_unavailable'.tr());
  }

  Future<void> _submit(BookingCubit cubit) async {
    if (!await requireSession(context)) return;
    cubit.setPromo(_promo.text);
    await cubit.submit();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<BookingCubit, BookingState>(
      listenWhen: (prev, next) => next is BookingAwaitingPayment && prev is! BookingAwaitingPayment
          || next is BookingPaid,
      listener: (context, state) {
        switch (state) {
          // Ouverture directe quand le serveur facture ce qui était affiché ;
          // sinon le nouveau montant est montré d'abord.
          case BookingAwaitingPayment(:final booking, :final paymentUrl):
            final draftTotal = context.read<BookingCubit>().lastEstimateTotal;
            if (draftTotal == booking.totalAmount) _openWave(paymentUrl);
          case BookingPaid(:final booking):
            Navigator.of(context).pop();
            context.router.push(ReceiptRoute(booking: booking, property: widget.property));
          default:
        }
      },
      builder: (context, state) {
        final cubit = context.read<BookingCubit>();
        return AppSheet(
          title: 'booking.title'.tr(),
          footer: _footer(context, cubit, state),
          child: switch (state) {
            BookingDraft() => _draft(context, cubit, state),
            BookingSubmitting() || BookingConfirming() => Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Column(children: [
                const AppLoader(),
                if (state is BookingConfirming) ...[
                  const SizedBox(height: 12),
                  Text('booking.confirming'.tr()),
                ],
              ]),
            ),
            BookingAwaitingPayment(:final booking) => AppCallout(
              message: cubit.lastEstimateTotal == booking.totalAmount
                  ? 'booking.waiting'.tr()
                  : 'booking.amount_changed'.tr(namedArgs: {'amount': formatFcfa(booking.totalAmount)}),
            ),
            BookingUnverified() => AppCallout(message: 'booking.unverified'.tr()),
            BookingPaymentFailed(:final message) => AppCallout(message: message),
            BookingPaid() => const SizedBox.shrink(),
          },
        );
      },
    );
  }

  Widget _draft(BuildContext context, BookingCubit cubit, BookingDraft s) {
    final t = context.tokens;
    final e = s.estimate;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text((s.start == null ? 'booking.pick_start' : 'booking.pick_end').tr(), style: context.mutedText),
        const SizedBox(height: 8),
        StayCalendar(occupied: s.occupied, start: s.start, end: s.end, onChanged: cubit.selectDates),
        if (s.message != null) ...[
          const SizedBox(height: 8),
          Text(s.message!, style: TextStyle(color: t.accentRed)),
        ],
        if (e != null) ...[
          const SizedBox(height: 12),
          _Line('booking.line'.tr(namedArgs: {'price': formatFcfa(e.dailyPrice), 'days': '${e.days}'}),
              formatFcfa(e.days * e.dailyPrice)),
          if (e.discountPercent > 0)
            _Line('booking.discount'.tr(namedArgs: {'percent': '${e.discountPercent}'}),
                '− ${formatFcfa(e.discountAmount)}'),
          const SizedBox(height: 8),
          TextField(
            controller: _promo,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(
              prefixIcon: const Icon(LucideIcons.tag, size: 16),
              hintText: 'booking.promo'.tr(),
              helperText: 'booking.promo_hint'.tr(),
            ),
          ),
          const Divider(height: 24),
          _Line('booking.total'.tr(), formatFcfa(e.subtotal), strong: true),
        ],
      ],
    );
  }

  Widget? _footer(BuildContext context, BookingCubit cubit, BookingState s) => switch (s) {
    BookingDraft() => AppButton(
      label: 'booking.pay'.tr(),
      expand: true,
      onPressed: s.canSubmit ? () => _submit(cubit) : null,
    ),
    BookingAwaitingPayment(:final booking, :final paymentUrl) => AppButton(
      label: 'booking.pay_amount'.tr(namedArgs: {'amount': formatFcfa(booking.totalAmount)}),
      expand: true,
      onPressed: () => _openWave(paymentUrl),
    ),
    BookingUnverified() || BookingPaymentFailed() => AppButton(
      label: 'booking.retry'.tr(),
      expand: true,
      onPressed: cubit.retryPayment,
    ),
    _ => null,
  };
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.strong = false});
  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final style = strong ? context.text.titleMedium : context.text.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Expanded(child: Text(label, style: strong ? style : context.mutedText)),
        Text(value, style: style),
      ]),
    );
  }
}
```

`lastEstimateTotal` : ajouter au cubit le dernier sous-total estimé, mémorisé dans `submit()` avant la création :

```dart
  /// Sous-total affiché au moment de payer, comparé au montant du serveur.
  /// `null` si un code promo a été saisi : la remise n'est connue que du
  /// serveur, le montant final est alors toujours montré avant Wave.
  int? lastEstimateTotal;
```

et, dans `submit()`, juste après le contrôle `canSubmit` :

```dart
    lastEstimateTotal = (d.promoCode?.isNotEmpty ?? false) ? null : d.estimate!.subtotal;
```

Vérifier la signature d'`AppCallout` (`grep -n "this\." lib/shared/widgets/app_callout.dart`) et adapter `message:` si besoin.

`client/lib/features/booking/presentation/screens/receipt_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/router/app_router.gr.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../../shared/utils/money.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../property/data/models/property_model.dart';
import '../../data/models/booking_model.dart';

@RoutePage()
class ReceiptScreen extends StatelessWidget {
  const ReceiptScreen({required this.booking, required this.property, super.key});
  final BookingModel booking;
  final PropertyModel property;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final dates = DateFormat.MMMEd(context.locale.toLanguageTag());
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            const Spacer(),
            Container(
              width: 72, height: 72,
              decoration: BoxDecoration(color: t.accentGreenSoft, borderRadius: AppRadius.pill),
              child: Icon(LucideIcons.check, color: t.accentGreen, size: 32),
            ),
            const SizedBox(height: 16),
            Text('booking.receipt_title'.tr(), style: context.text.headlineSmall),
            Text('booking.receipt_subtitle'.tr(), style: context.mutedText),
            const SizedBox(height: 20),
            DecoratedBox(
              decoration: BoxDecoration(border: Border.all(color: t.border), borderRadius: AppRadius.md),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(property.title, style: context.text.titleMedium),
                  Text('${dates.format(booking.startDate)} → ${dates.format(booking.endDate)} · '
                      '${'booking.days'.tr(namedArgs: {'count': '${booking.daysCount}'})}', style: context.mutedText),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: Text('booking.paid'.tr(), style: context.mutedText)),
                    Text(formatFcfa(booking.totalAmount), style: context.text.titleMedium),
                  ]),
                ]),
              ),
            ),
            const Spacer(),
            AppButton(
              label: 'booking.see_bookings'.tr(),
              expand: true,
              onPressed: () => context.router.replaceAll([const ExploreRoute(), const BookingsRoute()]),
            ),
          ]),
        ),
      ),
    );
  }
}
```

(`BookingsRoute` arrive à la Task 12 : d'ici là, `replaceAll([const ExploreRoute()])` avec un commentaire `// Task 12`.)

- [ ] **Step 8 : routes, DI, branchement de la fiche**

`app_router.dart` : `AutoRoute(page: ReceiptRoute.page),`.
`service_locator.dart` :

```dart
  sl.registerLazySingleton(() => BookingRepository(sl()));
  // La résidence réservée est passée à la création : le cubit en lit la
  // grille tarifaire et la disponibilité.
  sl.registerFactoryParam<BookingCubit, PropertyModel, void>(
    (property, _) => BookingCubit(sl(), sl(), property),
  );
```

`property_detail_screen.dart` : `onReserve: () => showBookingSheet(context, property),`.

- [ ] **Step 9 : vérifier**

Run: `cd client && dart run build_runner build --delete-conflicting-outputs && flutter test && flutter analyze`
Expected: tout PASS, analyse propre.

- [ ] **Step 10 : commit (sur demande)**

```bash
git add pubspec.yaml pubspec.lock lib assets/translations test/features/booking
git commit -m "feat(booking): reservation, calendrier des dates libres et paiement wave"
```

---

### Task 12 : historique des réservations

**Files:**
- Create: `client/lib/features/bookings/business_logic/bookings_cubit.dart`, `bookings_state.dart`
- Create: `client/lib/features/bookings/presentation/screens/bookings_screen.dart`
- Create: `client/lib/features/bookings/presentation/widgets/booking_card.dart`
- Modify: router (gardée), DI, tiroir, `receipt_screen.dart`, traductions
- Test: `client/test/features/bookings/bookings_cubit_test.dart`, `client/test/features/bookings/booking_card_test.dart`

**Interfaces:**
- Consumes: `BookingRepository.list/initWave/confirmWave`, `BookingModel`, `StatusBadge`, `StatusTones`, `formatFcfa`.
- Produces: `BookingsCubit` (`BookingsLoading`, `BookingsLoaded(items, meta, {loadingMore})`, `BookingsError(message)`) ; `load()`, `loadMore()`, `Future<String?> pay(BookingModel)`, `Future<void> confirmPending()` ; `String paymentLabelKey(BookingModel)` ; route `BookingsRoute` (gardée par `AuthGuard`).

- [ ] **Step 1 : traductions**

`fr.json` :

```json
"bookings": {
  "title": "Mes réservations",
  "empty": "Vos réservations apparaîtront ici.",
  "payment": {
    "success": "Payée",
    "pending": "En attente de paiement",
    "failed": "Paiement non abouti"
  },
  "cancelled": "Annulée",
  "pay": "Payer"
}
```

`en.json` :

```json
"bookings": {
  "title": "My bookings",
  "empty": "Your bookings will show up here.",
  "payment": {
    "success": "Paid",
    "pending": "Awaiting payment",
    "failed": "Payment failed"
  },
  "cancelled": "Cancelled",
  "pay": "Pay"
}
```

- [ ] **Step 2 : écrire les tests qui échouent**

`client/test/features/bookings/booking_card_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/features/booking/data/models/booking_model.dart';
import 'package:resi_client/features/bookings/presentation/widgets/booking_card.dart';

BookingModel b(String? payment, {String status = 'confirmed'}) => BookingModel.fromJson({
  'id': 'b1', 'property_id': 'p1', 'status': status,
  'start_date': '2026-10-10T00:00:00.000Z', 'end_date': '2026-10-12T00:00:00.000Z',
  'total_amount': 80000, 'payment_status': payment,
});

void main() {
  test('libellé du paiement', () {
    expect(paymentLabelKey(b('success')), 'bookings.payment.success');
    expect(paymentLabelKey(b('pending')), 'bookings.payment.pending');
    expect(paymentLabelKey(b(null)), 'bookings.payment.pending');
    expect(paymentLabelKey(b('expired')), 'bookings.payment.failed');
    expect(paymentLabelKey(b('success', status: 'cancelled')), 'bookings.cancelled');
  });

  test('une réservation non payée et non annulée peut être payée', () {
    expect(canPay(b(null)), isTrue);
    expect(canPay(b('failed')), isTrue);
    expect(canPay(b('success')), isFalse);
    expect(canPay(b(null, status: 'cancelled')), isFalse);
  });
}
```

`client/test/features/bookings/bookings_cubit_test.dart` :

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_client/features/booking/data/models/booking_model.dart';
import 'package:resi_client/features/booking/data/repositories/booking_repository.dart';
import 'package:resi_client/features/bookings/business_logic/bookings_cubit.dart';
import 'package:resi_client/features/bookings/business_logic/bookings_state.dart';
import 'package:resi_client/shared/models/page_meta.dart';

class _Repo implements BookingRepository {
  final confirmed = <String>[];
  @override
  Future<Page<BookingModel>> list({required int page}) async => Page(
    items: [BookingModel.fromJson({
      'id': 'b$page', 'property_id': 'p1', 'status': 'confirmed',
      'start_date': '2026-10-10T00:00:00.000Z', 'end_date': '2026-10-12T00:00:00.000Z',
      'total_amount': 80000,
    })],
    meta: PageMeta(total: 2, perPage: 1, currentPage: page, lastPage: 2),
  );

  @override
  Future<String> initWave(String bookingId) async => 'https://pay.wave.com/c/$bookingId';

  @override
  Future<String> confirmWave(String bookingId) async {
    confirmed.add(bookingId);
    return 'success';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('liste paginée', () async {
    final cubit = BookingsCubit(_Repo());
    await cubit.load();
    await cubit.loadMore();
    expect((cubit.state as BookingsLoaded).items.map((b) => b.id), ['b1', 'b2']);
  });

  test('payer depuis l’historique puis constater au retour', () async {
    final repo = _Repo();
    final cubit = BookingsCubit(repo);
    await cubit.load();

    final url = await cubit.pay((cubit.state as BookingsLoaded).items.first);
    expect(url, 'https://pay.wave.com/c/b1');

    await cubit.confirmPending();
    expect(repo.confirmed, ['b1']);
    await cubit.confirmPending(); // déjà constaté : rien à refaire
    expect(repo.confirmed, ['b1']);
  });
}
```

- [ ] **Step 3 : vérifier l'échec**

Run: `cd client && flutter test test/features/bookings`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 4 : implémenter**

`client/lib/features/bookings/business_logic/bookings_state.dart` :

```dart
import '../../../shared/models/page_meta.dart';
import '../../booking/data/models/booking_model.dart';

sealed class BookingsState {
  const BookingsState();
}

final class BookingsLoading extends BookingsState {
  const BookingsLoading();
}

final class BookingsLoaded extends BookingsState {
  const BookingsLoaded(this.items, this.meta, {this.loadingMore = false});
  final List<BookingModel> items;
  final PageMeta meta;
  final bool loadingMore;
}

final class BookingsError extends BookingsState {
  const BookingsError(this.message);
  final String message;
}
```

`client/lib/features/bookings/business_logic/bookings_cubit.dart` :

```dart
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failures.dart';
import '../../booking/data/models/booking_model.dart';
import '../../booking/data/repositories/booking_repository.dart';
import 'bookings_state.dart';

class BookingsCubit extends Cubit<BookingsState> {
  BookingsCubit(this._repo) : super(const BookingsLoading());
  final BookingRepository _repo;

  /// Réservation dont le paiement vient d'être lancé depuis l'historique,
  /// à constater au retour de Wave.
  String? _pendingPayment;

  Future<void> load() async {
    emit(const BookingsLoading());
    try {
      final page = await _repo.list(page: 1);
      if (!isClosed) emit(BookingsLoaded(page.items, page.meta));
    } on AppFailure catch (f) {
      if (!isClosed) emit(BookingsError(f.userMessage));
    }
  }

  Future<void> loadMore() async {
    final s = state;
    if (s is! BookingsLoaded || !s.meta.hasMore || s.loadingMore) return;
    emit(BookingsLoaded(s.items, s.meta, loadingMore: true));
    try {
      final page = await _repo.list(page: s.meta.currentPage + 1);
      if (!isClosed) emit(BookingsLoaded([...s.items, ...page.items], page.meta));
    } on AppFailure {
      if (!isClosed) emit(BookingsLoaded(s.items, s.meta));
    }
  }

  /// Lien Wave d'une réservation restée impayée ; `null` en cas d'échec.
  Future<String?> pay(BookingModel booking) async {
    try {
      final url = await _repo.initWave(booking.id);
      _pendingPayment = booking.id;
      return url;
    } on AppFailure {
      return null;
    }
  }

  /// Retour de Wave : constate le paiement puis relit la liste.
  Future<void> confirmPending() async {
    final id = _pendingPayment;
    if (id == null) return;
    _pendingPayment = null;
    try {
      await _repo.confirmWave(id);
    } on AppFailure {
      // La liste relue dira l'état réel ; le webhook peut aussi trancher.
    }
    await load();
  }
}
```

`client/lib/features/bookings/presentation/widgets/booking_card.dart` :

```dart
import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/resi_tokens.dart';
import '../../../../shared/utils/money.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/status_badge.dart';
import '../../../booking/data/models/booking_model.dart';

/// Libellé d'état affiché sur la carte : l'annulation prime sur le paiement.
String paymentLabelKey(BookingModel b) {
  if (b.status == 'cancelled') return 'bookings.cancelled';
  return switch (b.paymentStatus) {
    'success' => 'bookings.payment.success',
    'pending' || null => 'bookings.payment.pending',
    _ => 'bookings.payment.failed',
  };
}

bool canPay(BookingModel b) => b.status != 'cancelled' && !b.isPaid;

StatusTone _tone(BookingModel b) => b.status == 'cancelled'
    ? StatusTones.booking('cancelled')
    : StatusTones.payment(switch (b.paymentStatus) {
        'success' => 'success',
        'pending' || null => 'pending',
        _ => 'failed',
      });

class BookingCard extends StatelessWidget {
  const BookingCard({required this.booking, required this.onPay, super.key});
  final BookingModel booking;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final b = booking;
    final dates = DateFormat.MMMd(context.locale.toLanguageTag());
    return DecoratedBox(
      decoration: BoxDecoration(color: t.surface, border: Border.all(color: t.border), borderRadius: AppRadius.md),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: AppRadius.sm,
            child: SizedBox.square(
              dimension: 64,
              child: b.property?.image == null
                  ? ColoredBox(color: t.border)
                  : CachedNetworkImage(imageUrl: b.property!.image!, fit: BoxFit.cover),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(b.property?.title ?? '—', style: context.text.titleSmall),
              Text('${dates.format(b.startDate)} → ${dates.format(b.endDate)}', style: context.mutedText),
              const SizedBox(height: 6),
              Row(children: [
                StatusBadge(label: paymentLabelKey(b).tr(), tone: _tone(b)),
                const Spacer(),
                Text(formatFcfa(b.totalAmount), style: context.text.amount),
              ]),
              if (canPay(b)) ...[
                const SizedBox(height: 8),
                AppButton(label: 'bookings.pay'.tr(), size: AppButtonSize.sm, onPressed: onPay),
              ],
            ]),
          ),
        ]),
      ),
    );
  }
}
```

`client/lib/features/bookings/presentation/screens/bookings_screen.dart` :

```dart
import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../../shared/widgets/app_loader.dart';
import '../../../../shared/widgets/app_toast.dart';
import '../../../../shared/widgets/app_top_bar.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/error_state.dart';
import '../../business_logic/bookings_cubit.dart';
import '../../business_logic/bookings_state.dart';
import '../widgets/booking_card.dart';

@RoutePage()
class BookingsScreen extends StatelessWidget {
  const BookingsScreen({super.key});

  @override
  Widget build(BuildContext context) => BlocProvider(
    create: (_) => sl<BookingsCubit>()..load(),
    child: const _BookingsView(),
  );
}

class _BookingsView extends StatefulWidget {
  const _BookingsView();
  @override
  State<_BookingsView> createState() => _BookingsViewState();
}

class _BookingsViewState extends State<_BookingsView> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) context.read<BookingsCubit>().confirmPending();
  }

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<BookingsCubit>();
    return Scaffold(
      appBar: AppTopBar(title: 'bookings.title'.tr()),
      body: BlocBuilder<BookingsCubit, BookingsState>(
        builder: (context, state) => switch (state) {
          BookingsLoading() => const Center(child: AppLoader()),
          BookingsError(:final message) => ErrorState(message: message, onRetry: cubit.load),
          BookingsLoaded(:final items) when items.isEmpty =>
            EmptyState(icon: AppSectionIcons.bookings, message: 'bookings.empty'.tr()),
          BookingsLoaded(:final items, :final meta) => RefreshIndicator(
            onRefresh: cubit.load,
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length + (meta.hasMore ? 1 : 0),
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                if (i == items.length) {
                  cubit.loadMore();
                  return const Center(child: AppLoader(size: 24));
                }
                return BookingCard(
                  booking: items[i],
                  onPay: () async {
                    final url = await cubit.pay(items[i]);
                    final ok = url != null &&
                        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                    if (!ok) AppToast.error('booking.wave_unavailable'.tr());
                  },
                );
              },
            ),
          ),
        },
      ),
    );
  }
}
```

- [ ] **Step 5 : routes, DI, branchements**

`app_router.dart` : `AutoRoute(page: BookingsRoute.page, guards: [_signedIn]),`.
`service_locator.dart` : `sl.registerFactory(() => BookingsCubit(sl()));`.
`app_drawer.dart` : décommenter « Mes réservations ». `receipt_screen.dart` : rétablir `replaceAll([const ExploreRoute(), const BookingsRoute()])`.

- [ ] **Step 6 : vérifier**

Run: `cd client && dart run build_runner build --delete-conflicting-outputs && flutter test && flutter analyze`
Expected: tout PASS, analyse propre.

- [ ] **Step 7 : commit (sur demande)**

```bash
git add lib assets/translations test/features/bookings
git commit -m "feat(bookings): historique, etat du paiement et reprise du paiement wave"
```

---

### Task 13 : vérification d'ensemble

**Files:** aucun, sauf correctifs découverts.

- [ ] **Step 1 : qualité**

Run: `cd client && flutter analyze && flutter test`
Expected: aucun problème, tous les tests PASS. Rechercher les reliquats : `grep -rn "Task 1[0-2]\|// Task" lib` doit être vide.

- [ ] **Step 2 : compilation**

Run: `cd client && MAPS_API_KEY=<clé> flutter build apk --debug -t lib/main_dev.dart --dart-define=GOOGLE_SERVER_CLIENT_ID=<client web>`
Expected: `√ Built build/app/outputs/flutter-apk/app-debug.apk`.

- [ ] **Step 3 : parcours manuel sur appareil (API du plan A déployée ou locale)**

Cocher chaque point, noter tout écart :

1. Accueil sans compte : carte stylée, pastilles, feuille « À la une » ; thème sombre → carte sombre.
2. Localisation refusée : carte sur Abidjan, aucune redemande ; ◎ propose la permission.
3. Recherche « Abidjan » + Villa → pile de cartes ; glisser à gauche, à droite (toast « Ajoutée à vos favoris »), toucher le centre → fiche.
4. Bouton 🗺 : résultats sur la carte.
5. Fiche : galerie, équipements, mini-carte en cercle, aucun numéro ni nom de propriétaire.
6. Réserver sans compte → connexion → retour sur la feuille, dates conservées.
7. Compte propriétaire dans l'app client → message « Ce compte n'est pas un compte client ».
8. Dates chevauchant un séjour → refus sous le calendrier ; paiement → Wave s'ouvre ; retour → reçu.
9. Paiement abandonné dans Wave → « Le paiement n'a pas abouti » + « Réessayer ».
10. Mes réservations : badge Payée / En attente ; « Payer » sur une réservation en attente.
11. Mode sombre et anglais : tous les écrans lisibles, aucune clé brute affichée.

- [ ] **Step 4 : rapport**

Rapporter à l'utilisateur ce qui a été vérifié automatiquement, ce qui l'a été à la main, et ce qui n'a pas pu l'être (clé Maps ou client OAuth absents, Wave de test indisponible).
