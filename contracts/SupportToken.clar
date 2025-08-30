;; SupportToken.clar - DSN Token (SIP-010 compliant with advanced features)

;; Traits
(define-trait sip010-trait
  {
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  }
)

;; Token Definition
(define-fungible-token dsn-token u1000000000) ;; Max supply: 1 billion

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-insufficient-balance (err u101))
(define-constant err-invalid-amount (err u102))
(define-constant err-paused (err u103))
(define-constant err-blacklisted (err u104))
(define-constant err-max-supply-reached (err u105))
(define-constant err-invalid-recipient (err u106))
(define-constant err-already-blacklisted (err u107))
(define-constant err-not-blacklisted (err u108))
(define-constant err-unauthorized (err u109))
(define-constant err-invalid-metadata (err u110))
(define-constant max-metadata-len u256)

;; Data Variables
(define-data-var paused bool false)
(define-data-var token-uri (optional (string-utf8 256)) (some u"https://dsn.example.com/token-metadata.json"))
(define-data-var total-minted uint u0)

;; Data Maps
(define-map blacklisted principal bool)
(define-map mint-metadata uint { minter: principal, amount: uint, timestamp: uint, notes: (string-utf8 256) })
(define-data-var mint-counter uint u0)

;; Private Functions
(define-private (is-owner)
  (is-eq tx-sender contract-owner)
)

(define-private (is-not-blacklisted (account principal))
  (default-to false (map-get? blacklisted account))
)

;; Public Functions

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (not (var-get paused)) err-paused)
    (asserts! (is-eq tx-sender sender) err-unauthorized)
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (<= amount (ft-get-balance dsn-token sender)) err-insufficient-balance)
    (asserts! (not (is-not-blacklisted sender)) err-blacklisted)
    (asserts! (not (is-not-blacklisted recipient)) err-blacklisted)
    (try! (ft-transfer? dsn-token amount sender recipient))
    (print { event: "transfer", amount: amount, from: sender, to: recipient, memo: memo })
    (ok true)
  )
)

(define-public (mint (amount uint) (recipient principal) (notes (string-utf8 256)))
  (begin
    (asserts! (is-owner) err-owner-only)
    (asserts! (not (var-get paused)) err-paused)
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (<= (+ (var-get total-minted) amount) (ft-get-supply dsn-token)) err-max-supply-reached)
    (asserts! (<= (len notes) max-metadata-len) err-invalid-metadata)
    (asserts! (not (is-not-blacklisted recipient)) err-blacklisted)
    (try! (ft-mint? dsn-token amount recipient))
    (var-set total-minted (+ (var-get total-minted) amount))
    (let ((id (+ (var-get mint-counter) u1)))
      (map-set mint-metadata id { minter: tx-sender, amount: amount, timestamp: block-height, notes: notes })
      (var-set mint-counter id)
    )
    (print { event: "mint", amount: amount, to: recipient, notes: notes })
    (ok true)
  )
)

(define-public (burn (amount uint))
  (begin
    (asserts! (not (var-get paused)) err-paused)
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (<= amount (ft-get-balance dsn-token tx-sender)) err-insufficient-balance)
    (try! (ft-burn? dsn-token amount tx-sender))
    (var-set total-minted (- (var-get total-minted) amount))
    (print { event: "burn", amount: amount, from: tx-sender })
    (ok true)
  )
)

(define-public (pause)
  (begin
    (asserts! (is-owner) err-owner-only)
    (var-set paused true)
    (print { event: "pause" })
    (ok true)
  )
)

(define-public (unpause)
  (begin
    (asserts! (is-owner) err-owner-only)
    (var-set paused false)
    (print { event: "unpause" })
    (ok true)
  )
)

(define-public (blacklist (account principal))
  (begin
    (asserts! (is-owner) err-owner-only)
    (asserts! (not (default-to false (map-get? blacklisted account))) err-already-blacklisted)
    (map-set blacklisted account true)
    (print { event: "blacklist", account: account })
    (ok true)
  )
)

(define-public (unblacklist (account principal))
  (begin
    (asserts! (is-owner) err-owner-only)
    (asserts! (default-to false (map-get? blacklisted account)) err-not-blacklisted)
    (map-delete blacklisted account)
    (print { event: "unblacklist", account: account })
    (ok true)
  )
)

(define-public (set-token-uri (new-uri (optional (string-utf8 256))))
  (begin
    (asserts! (is-owner) err-owner-only)
    (var-set token-uri new-uri)
    (print { event: "set-token-uri", uri: new-uri })
    (ok true)
  )
)

;; Read-Only Functions

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance dsn-token account))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply dsn-token))
)

(define-read-only (get-name)
  (ok "DSN Token")
)

(define-read-only (get-symbol)
  (ok "DSN")
)

(define-read-only (get-decimals)
  (ok u8)
)

(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)

(define-read-only (get-mint-metadata (id uint))
  (map-get? mint-metadata id)
)

(define-read-only (get-blacklisted (account principal))
  (ok (default-to false (map-get? blacklisted account)))
)

(define-read-only (get-total-minted)
  (ok (var-get total-minted))
)

(define-read-only (get-mint-counter)
  (ok (var-get mint-counter))
)

;; Initial Mint (for testing/deployment)
(begin
  (try! (mint u1000000000 contract-owner u"Initial mint to owner"))
)