<?php
/**
 * Uji kontrak lintas bahasa: kelas PHP ASLI plugin ApeironKit (dibaca saja, tidak diubah)
 * → HTTP sungguhan → server MDUNDIG hasil build → PostgreSQL lokal.
 * Stub WordPress minimum meniru pola tests/daftar-hadiah-integration-self-check.php milik plugin.
 * Satu-satunya pengalihan: wp_safe_remote_post mengirim ke 127.0.0.1:PORT dengan path yang sama
 * (plugin menolak URL localhost/port, sehingga URL pengaturan memakai domain contoh).
 */
declare( strict_types=1 );

namespace {
	define( 'ABSPATH', __DIR__ . '/' );
	define( 'MINUTE_IN_SECONDS', 60 );
	set_error_handler( static function ( int $severity, string $message, string $file, int $line ): void { throw new \ErrorException( $message, 0, $severity, $file, $line ); } );

	$plugin = getenv( 'PLUGIN_DIR' ) ?: '';
	$port = (int) getenv( 'MDUNDIG_PORT' );
	$token = getenv( 'MDUNDIG_TOKEN' ) ?: '';
	if ( ! is_dir( $plugin ) || $port < 1 || '' === $token ) { fwrite( STDERR, "Missing PLUGIN_DIR/MDUNDIG_PORT/MDUNDIG_TOKEN\n" ); exit( 2 ); }

	class WP_Error {
		public string $code; public string $message; public array $data;
		public function __construct( string $code, string $message = '', array $data = [] ) { $this->code = $code; $this->message = $message; $this->data = $data; }
		public function get_error_message(): string { return $this->message; }
		public function get_error_code(): string { return $this->code; }
	}
	$options = []; $requests = []; $owner_resolver = null; $titles = [ 101 => 'Andi &amp; Sari', 102 => 'Rina &amp; Doni' ];
	function __( string $text, string $domain = '' ): string { return $text; }
	function get_option( string $key, $default = false ) { return $GLOBALS['options'][ $key ] ?? $default; }
	function update_option( string $key, $value, bool $autoload = false ): bool { $GLOBALS['options'][ $key ] = $value; return true; }
	function wp_salt( string $scheme ): string { return 'harness-only-salt-' . $scheme; }
	function wp_hash( string $value ): string { return hash_hmac( 'md5', $value, wp_salt( 'nonce' ) ); }
	function wp_json_encode( $value ) { return json_encode( $value ); }
	function wp_parse_url( string $url, int $component = -1 ) { return parse_url( $url, $component ); }
	function wp_generate_uuid4(): string { $b = random_bytes( 16 ); $b[6] = chr( ord( $b[6] ) & 0x0f | 0x40 ); $b[8] = chr( ord( $b[8] ) & 0x3f | 0x80 ); return vsprintf( '%s%s-%s-%s-%s-%s%s%s', str_split( bin2hex( $b ), 4 ) ); }
	function home_url( string $path ): string { return 'https://undangan-uji.example.com' . $path; }
	function get_current_blog_id(): int { return 1; }
	function get_post( int $id ) { return in_array( $id, [ 101, 102, 5 ], true ) ? (object) [ 'ID' => $id, 'post_type' => 'page', 'post_status' => 'publish', 'post_password' => '' ] : null; }
	function get_the_title( int $id ): string { return $GLOBALS['titles'][ $id ] ?? ( 'Halaman ' . $id ); }
	function apply_filters( string $tag, $value, ...$args ) { return 'apeiron_daftar_hadiah_owner_id' === $tag && $GLOBALS['owner_resolver'] ? ( $GLOBALS['owner_resolver'] )( $value, ...$args ) : $value; }
	function sanitize_text_field( string $value ): string { return trim( strip_tags( preg_replace( '/[\x00-\x1f\x7f]/', '', $value ) ) ); }
	function is_wp_error( $value ): bool { return $value instanceof WP_Error; }
	function esc_url_raw( string $value, array $protocols = [] ): string { return $value; }
	function sanitize_textarea_field( string $value ): string { return trim( strip_tags( $value ) ); }
	function sanitize_key( string $value ): string { return strtolower( preg_replace( '/[^A-Za-z0-9_-]/', '', $value ) ); }
	function wp_parse_args( $args, array $defaults = [] ): array { return array_merge( $defaults, is_array( $args ) ? $args : [] ); }
	function wp_safe_remote_post( string $url, array $args ) {
		$GLOBALS['requests'][] = [ 'url' => $url, 'args' => $args ];
		$path = (string) parse_url( $url, PHP_URL_PATH );
		$curl = curl_init( 'http://127.0.0.1:' . $GLOBALS['port'] . $path );
		$headers = [];
		foreach ( $args['headers'] as $name => $value ) { $headers[] = $name . ': ' . $value; }
		$response_headers = [];
		curl_setopt_array( $curl, [
			CURLOPT_POST => true, CURLOPT_POSTFIELDS => $args['body'], CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true,
			CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => (int) $args['timeout'],
			CURLOPT_HEADERFUNCTION => static function ( $c, string $line ) use ( &$response_headers ): int { $p = explode( ':', $line, 2 ); if ( 2 === count( $p ) ) { $response_headers[ strtolower( trim( $p[0] ) ) ] = trim( $p[1] ); } return strlen( $line ); },
		] );
		$body = curl_exec( $curl );
		if ( false === $body ) { return new WP_Error( 'http_request_failed', curl_error( $curl ) ); }
		$code = (int) curl_getinfo( $curl, CURLINFO_RESPONSE_CODE );
		return [ 'response' => [ 'code' => $code ], 'headers' => $response_headers, 'body' => $body ];
	}
	function wp_safe_remote_get( string $url, array $args ) { throw new \RuntimeException( 'GET must not be used for API mode' ); }
	function wp_remote_retrieve_response_code( array $response ): int { return $response['response']['code']; }
	function wp_remote_retrieve_header( array $response, string $key ): string { return $response['headers'][ $key ] ?? ''; }
	function wp_remote_retrieve_body( array $response ): string { return $response['body'] ?? ''; }

	require $plugin . '/src/Core/Crypto.php';
	require $plugin . '/src/Support/DaftarHadiahSettings.php';
	require $plugin . '/src/Support/DaftarHadiahCatalog.php';
	require $plugin . '/src/Support/DaftarHadiahGateway.php';
	require $plugin . '/src/Support/FormOrderSettings.php';
	use ApeironKit\Support\DaftarHadiahSettings as Settings;
	use ApeironKit\Support\DaftarHadiahCatalog as Catalog;
	use ApeironKit\Support\DaftarHadiahGateway as Gateway;
	use ApeironKit\Support\FormOrderSettings as FormOrder;

	$checks = 0;
	$check = static function ( bool $ok, string $message ) use ( &$checks ): void { if ( ! $ok ) { throw new \RuntimeException( 'FAIL: ' . $message ); } ++$checks; };
	$err = static function ( $value ): string { return is_wp_error( $value ) ? $value->get_error_code() . ' — ' . $value->get_error_message() : 'ok'; };

	// --- Konfigurasi konektor sebagaimana disimpan admin WordPress
	$api_url = 'https://daftar-hadiah.example.com/api/daftar-hadiah';
	$options[ Settings::OPTION_NAME ] = [ 'enabled' => 'yes', 'provider' => 'api', 'api_url' => $api_url ];
	$check( Settings::valid_api_url( $api_url ), 'URL API valid menurut plugin' );
	$check( Settings::valid_api_token( $token ), 'Token buatan MDUNDIG lolos validasi format plugin' );
	$check( Settings::save_api_token( $token ), 'Token tersimpan terenkripsi' );
	$check( FormOrder::api_url() === 'https://daftar-hadiah.example.com/api/form-order', 'URL Form Order diturunkan otomatis dari URL Daftar Hadiah' );

	// --- Ping
	$ping = Gateway::request( 'ping' );
	$check( ! is_wp_error( $ping ) && true === $ping['backend_ready'], 'Ping registry-api-v1 diterima plugin: ' . $err( $ping ) );
	$check( 0 === $requests[0]['args']['redirection'] && 'Bearer ' . $token === $requests[0]['args']['headers']['Authorization'], 'Bearer token di header, tanpa redirect' );
	$check( false === strpos( $requests[0]['args']['body'], $token ), 'Token tidak berada di body JSON' );

	// --- Katalog seperti DaftarHadiahCatalog::remember()
	$gifts = [
		[ 'gift_id' => 'gift-stable', 'name' => 'Rice Cooker', 'description' => 'Hadiah dapur', 'image_url' => 'https://example.com/a.webp', 'purchase_url' => '', 'initial_quantity' => 5, 'available_quantity' => 4, 'availability' => 'available' ],
		[ 'gift_id' => 'gift-solo', 'name' => 'Blender "Pro"', 'description' => '', 'image_url' => '', 'purchase_url' => 'https://example.com/shop?id=1&x=ü', 'initial_quantity' => 1, 'available_quantity' => 1, 'availability' => 'available' ],
		[ 'gift_id' => 'gift-off', 'name' => 'Kulkas', 'description' => '', 'image_url' => '', 'purchase_url' => '', 'initial_quantity' => 2, 'available_quantity' => 2, 'availability' => 'unavailable' ],
	];
	$record = static function ( int $invitation, array $gifts, string $version ) {
		return [ 'website_id' => Catalog::website_id(), 'invitation_id' => $invitation, 'registry_id' => 'registry-900-abc', 'document_id' => 900, 'element_id' => 'abc',
			'catalog_hash' => hash( 'sha256', (string) wp_json_encode( $gifts ) ), 'catalog_version' => $version, 'invalid' => false, 'gifts' => $gifts ];
	};
	$version = sprintf( '%.0f', floor( microtime( true ) * 1000 ) );
	$rec = $record( 101, $gifts, $version );
	$payload = Catalog::payload( $rec );
	$check( 'Andi & Sari' === $payload['invitation_title'], 'Judul undangan didekode oleh plugin' );

	$data = Gateway::request( 'availability', $payload );
	$check( ! is_wp_error( $data ), 'availability pertama (tanpa registrasi manual): ' . $err( $data ) );
	$stock = Gateway::availability( $data, $rec );
	$check( ! is_wp_error( $stock ), 'Validasi stok ketat plugin lolos: ' . $err( $stock ) );
	$check( 4 === $stock[0]['available_quantity'] && 1 === $stock[1]['available_quantity'] && 0 === $stock[2]['available_quantity'], 'Kapasitas manual & status unavailable dihormati' );

	// --- Reserve seperti DaftarHadiahController::reserve()
	$reserve_payload = static function ( array $rec, string $gift, string $browser_request, string $name, string $phone, string $message ) {
		return Catalog::payload( $rec ) + [ 'gift_id' => $gift, 'quantity' => 1, 'guest' => [ 'name' => $name, 'whatsapp' => $phone ], 'message' => $message,
			'request_id' => hash_hmac( 'sha256', $rec['website_id'] . '|' . $rec['invitation_id'] . '|' . $rec['registry_id'] . '|' . $browser_request, wp_salt( 'nonce' ) ) ];
	};
	$receipt_ok = static function ( $data, string $gift ): bool {
		// Pemeriksaan identik dengan DaftarHadiahController::reserve() baris 128–131.
		return is_array( $data ) && 'confirmed' === ( $data['status'] ?? '' ) && $gift === ( $data['gift_id'] ?? '' ) && 1 === ( $data['quantity'] ?? null )
			&& is_string( $data['reservation_id'] ?? null ) && preg_match( '/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/Di', $data['reservation_id'] )
			&& is_string( $data['timestamp'] ?? null ) && preg_match( '/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/D', $data['timestamp'] );
	};
	$r1 = Gateway::request( 'reserve', $reserve_payload( $rec, 'gift-stable', str_repeat( 'a', 32 ), 'Budi', '6281234567890', "Selamat ya!\nSemoga bahagia." ) );
	$check( $receipt_ok( $r1, 'gift-stable' ), 'Receipt reserve lolos validasi controller: ' . $err( $r1 ) );
	$check( ! is_wp_error( Gateway::availability( $r1, $rec ) ) && 3 === Gateway::availability( $r1, $rec )[0]['available_quantity'], 'Stok 4→3 setelah reserve' );
	$check( false === $r1['already_reserved'], 'Reservasi baru' );
	$r2 = Gateway::request( 'reserve', $reserve_payload( $rec, 'gift-stable', str_repeat( 'a', 32 ), 'Budi', '6281234567890', "Selamat ya!\nSemoga bahagia." ) );
	$check( ! is_wp_error( $r2 ) && $r2['reservation_id'] === $r1['reservation_id'] && true === $r2['already_reserved'], 'Retry idempoten: receipt sama' );
	$solo1 = Gateway::request( 'reserve', $reserve_payload( $rec, 'gift-solo', str_repeat( 'b', 32 ), 'Sari', '6281111111111', '' ) );
	$check( $receipt_ok( $solo1, 'gift-solo' ), 'Reserve stok 1 berhasil' );
	$solo2 = Gateway::request( 'reserve', $reserve_payload( $rec, 'gift-solo', str_repeat( 'c', 32 ), 'Tono', '6282222222222', '' ) );
	$check( is_wp_error( $solo2 ) && 'gift_unavailable' === $solo2->get_error_code() && 409 === $solo2->data['status'], 'Stok habis → gift_unavailable (409) terbaca plugin: ' . $err( $solo2 ) );
	$conflict = Gateway::request( 'reserve', $reserve_payload( $rec, 'gift-stable', str_repeat( 'a', 32 ), 'Budi', '6281234567890', 'Pesan lain' ) );
	$check( is_wp_error( $conflict ) && 'request_conflict' === $conflict->get_error_code(), 'request_id sama, isi beda → request_conflict' );

	// --- Template sama, undangan berbeda
	$rec102 = $record( 102, $gifts, $version );
	$d102 = Gateway::request( 'availability', Catalog::payload( $rec102 ) );
	$s102 = Gateway::availability( $d102, $rec102 );
	$check( ! is_wp_error( $s102 ) && 4 === $s102[0]['available_quantity'] && 1 === $s102[1]['available_quantity'], 'Undangan lain dengan template sama → stok terpisah' );

	// --- Revisi lama ditolak
	$stale = Gateway::request( 'availability', Catalog::payload( $record( 101, $gifts, (string) ( (int) $version - 1 ) ) ) );
	$check( is_wp_error( $stale ) && 'catalog_stale' === $stale->get_error_code(), 'Revisi lama → catalog_stale' );

	// --- Laporan reservasi seperti DaftarHadiahHandler::read_reservations()
	$list = Gateway::request( 'reservations', Catalog::payload( $rec ) + [ 'offset' => 0 ] );
	$check( ! is_wp_error( $list ), 'reservations diterima: ' . $err( $list ) );
	$rows = $list['reservations'] ?? null;
	$check( is_array( $rows ) && count( $rows ) <= 30 && is_int( $list['total'] ?? null ) && 2 === $list['total']
		&& ( null === ( $list['next_offset'] ?? null ) || ( is_int( $list['next_offset'] ) && $list['next_offset'] > 0 && $list['next_offset'] <= $list['total'] ) ), 'Bentuk paging sesuai handler' );
	foreach ( $rows as $row ) {
		$check( is_array( $row['guest'] ?? null ) && is_string( $row['guest']['name'] ?? null ) && is_string( $row['guest']['whatsapp'] ?? null ) && is_string( $row['gift_name'] ?? null )
			&& is_string( $row['message'] ?? null ) && is_string( $row['timestamp'] ?? null ) && is_string( $row['status'] ?? null ) && is_int( $row['quantity'] ?? null )
			&& is_string( $row['reservation_id'] ?? null ) && is_string( $row['gift_id'] ?? null ) && is_string( $row['guest']['id'] ?? null ), 'Tipe tiap baris reservasi sesuai handler' );
	}
	$check( 'Blender "Pro"' === $rows[0]['gift_name'] && "Selamat ya!\nSemoga bahagia." === $rows[1]['message'], 'Terbaru dahulu; teks tamu utuh' );

	// --- owner_id eksternal dari filter server WordPress
	$owner_resolver = static function ( $default, int $post_id ): string { return 'customer-' . $post_id; };
	$owned = Gateway::request( 'availability', Catalog::payload( $rec ) );
	$check( ! is_wp_error( $owned ), 'owner_id string dipantulkan persis (plugin memeriksa scope.owner_id): ' . $err( $owned ) );
	$owner_resolver = null;

	// --- Form Order
	$failure = null;
	$check( FormOrder::test_api_connection( $failure ), 'Ping Form Order lolos: ' . (string) $failure );
	$fields = [ 'groom_name' => 'Andi', 'bank_account' => '0012345678', 'addons' => [ 'musik', 'galeri' ], 'akad_date' => '2026-12-01', 'akad_time' => '08:30', 'catatan_khusus' => 'Tema biru' ];
	$labels = [ 'groom_name' => 'Nama Pria', 'bank_account' => 'Nomor Rekening', 'addons' => 'Tambahan', 'akad_date' => 'Tanggal Akad', 'akad_time' => 'Jam Akad', 'catatan_khusus' => 'Catatan' ];
	$submission = hash( 'sha256', wp_hash( 'apeiron-form-order-request|5|5|order1|' . str_repeat( 'd', 32 ) . '|' . wp_json_encode( $fields ) ) );
	$check( FormOrder::send_to_api( $fields, $labels, [ 'post_id' => 5, 'document_id' => 5, 'element_id' => 'order1' ], $submission, $failure ), 'Submit Form Order terkonfirmasi: ' . (string) $failure );
	$check( FormOrder::send_to_api( $fields, $labels, [ 'post_id' => 5, 'document_id' => 5, 'element_id' => 'order1' ], $submission, $failure ), 'Retry identik tetap sukses (idempoten)' );
	$changed = $fields; $changed['groom_name'] = 'Budi';
	$retryable = null;
	$check( ! FormOrder::send_to_api( $changed, $labels, [ 'post_id' => 5, 'document_id' => 5, 'element_id' => 'order1' ], $submission, $failure, false, [], $retryable ) && false !== strpos( (string) $failure, 'Identitas pengiriman' ) && false === $retryable, 'Konflik request_id ditolak & tidak dikirim ulang' );
	// Plugin baru: nama step & teks opsi ikut terkirim (kunci opsi angka tetap objek JSON).
	$meta_fields = [ 'paket' => 'gold', 'nomor' => [ '1', '2' ], 'catatan_khusus' => 'Tema hijau' ];
	$meta_labels = [ 'paket' => 'Pilihan Paket', 'nomor' => 'Nomor Meja', 'catatan_khusus' => 'Catatan' ];
	$meta_submission = hash( 'sha256', 'meta|' . wp_json_encode( $meta_fields ) );
	$meta = [ 'sections' => [ 'paket' => 'Paket & Tema', 'nomor' => 'Paket & Tema', 'tidak_ada' => 'X' ], 'options' => [ 'paket' => [ 'gold' => 'Paket Gold' ], 'nomor' => [ '1' => 'Meja satu', '2' => 'Meja dua' ] ] ];
	$check( FormOrder::send_to_api( $meta_fields, $meta_labels, [ 'post_id' => 5, 'document_id' => 5, 'element_id' => 'order1' ], $meta_submission, $failure, false, $meta ), 'Submit dengan meta terkonfirmasi: ' . (string) $failure );

	// --- Token salah
	Settings::save_api_token( 'mdh_' . str_repeat( '0', 64 ) );
	$bad = Gateway::request( 'ping' );
	$check( is_wp_error( $bad ) && 'api_unauthorized' === $bad->get_error_code(), 'Token tidak dikenal → api_unauthorized' );

	echo json_encode( [ 'ok' => true, 'checks' => $checks, 'website_id' => Catalog::website_id(), 'meta_request_id' => $meta_submission ] ), "\n";
}
