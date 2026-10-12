<?php
/**
 * Site header and footer, rendered on the server so the active link, sign-up links and
 * menus stay correct on every page (including the plugin's virtual marketplace pages).
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	register_block_type( 'shopinbos/site-header', [
		'api_version'     => 3,
		'title'           => __( 'Shopinbos header', 'shopinbos' ),
		'category'        => 'theme',
		'attributes'      => [ 'minimal' => [ 'type' => 'boolean', 'default' => false ] ],
		'render_callback' => 'sib_theme_render_header',
	] );
	register_block_type( 'shopinbos/site-footer', [
		'api_version'     => 3,
		'title'           => __( 'Shopinbos footer', 'shopinbos' ),
		'category'        => 'theme',
		'attributes'      => [ 'minimal' => [ 'type' => 'boolean', 'default' => false ] ],
		'render_callback' => 'sib_theme_render_footer',
	] );
} );

/** Sign-up/app link. Uses the plugin's /go/ redirect when the plugin is active. */
function sib_theme_go( string $intent = '', array $args = [] ): string {
	if ( function_exists( 'sib_go_url' ) ) {
		return sib_go_url( $intent, $args );
	}
	$base = 'https://app.shopinbos.com';
	if ( 'login' === $intent ) {
		return $base . '/login';
	}
	return add_query_arg( array_merge( array_filter( [ 'intent' => $intent ] ), $args, [ 'source' => 'website' ] ), $base . '/signup' );
}

/** Default main menu, used until someone builds one in Appearance > Menus. */
function sib_theme_default_links(): array {
	return [
		[ __( 'How it works', 'shopinbos' ), home_url( '/' ) ],
		[ __( 'Find stock', 'shopinbos' ), home_url( '/marketplace/' ) ],
		[ __( 'Templates', 'shopinbos' ), home_url( '/templates/' ) ],
		[ __( 'For suppliers', 'shopinbos' ), home_url( '/for-suppliers/' ) ],
		[ __( 'For delivery', 'shopinbos' ), home_url( '/delivery/' ) ],
		[ __( 'Pricing', 'shopinbos' ), home_url( '/pricing/' ) ],
	];
}

/** Menu items as [label, url] pairs from a menu location, or the given defaults. */
function sib_theme_menu_links( string $location, array $defaults ): array {
	$locations = get_nav_menu_locations();
	if ( empty( $locations[ $location ] ) ) {
		return $defaults;
	}
	$items = wp_get_nav_menu_items( $locations[ $location ] );
	if ( ! $items ) {
		return $defaults;
	}
	return array_map( fn( $i ) => [ $i->title, $i->url ], array_filter( $items, fn( $i ) => ! $i->menu_item_parent ) );
}

/** True when the URL is the current page or a parent section of it (Find stock stays lit on product pages). */
function sib_theme_is_current( string $url ): bool {
	$path    = trailingslashit( (string) wp_parse_url( $url, PHP_URL_PATH ) );
	$current = trailingslashit( (string) wp_parse_url( add_query_arg( [] ), PHP_URL_PATH ) );
	if ( '/' === $path ) {
		return '/' === $current;
	}
	if ( '/marketplace/' === $path && str_starts_with( $current, '/suppliers/' ) ) {
		return true;
	}
	return str_starts_with( $current, $path );
}

function sib_theme_render_header( array $attrs ): string {
	$links = sib_theme_menu_links( 'primary', sib_theme_default_links() );
	ob_start();
	?>
	<header class="site-header">
		<div class="wrap hdr">
			<a href="<?php echo esc_url( home_url( '/' ) ); ?>" aria-label="<?php esc_attr_e( 'Shopinbos home', 'shopinbos' ); ?>" style="display:flex;align-items:center">
				<img src="<?php echo sib_theme_img( 'logo-dark.png' ); ?>" alt="Shopinbos" class="hlogo" width="178" height="17">
			</a>
			<?php if ( empty( $attrs['minimal'] ) ) : ?>
				<nav aria-label="<?php esc_attr_e( 'Main', 'shopinbos' ); ?>">
					<ul class="navlinks">
						<?php foreach ( $links as [ $label, $url ] ) : ?>
							<li><a class="navlink" href="<?php echo esc_url( $url ); ?>"<?php echo sib_theme_is_current( $url ) ? ' aria-current="page"' : ''; ?>><?php echo esc_html( $label ); ?></a></li>
						<?php endforeach; ?>
					</ul>
				</nav>
			<?php endif; ?>
			<div class="hdr-cta">
				<a class="lnk navcta" href="<?php echo esc_url( sib_theme_go( 'login' ) ); ?>" style="padding:0 10px"><?php esc_html_e( 'Log in', 'shopinbos' ); ?></a>
				<a class="btn btn-acc btn-s" href="<?php echo esc_url( sib_theme_go( '', [ 'place' => 'header' ] ) ); ?>"><?php esc_html_e( 'Start your shop', 'shopinbos' ); ?></a>
				<?php if ( empty( $attrs['minimal'] ) ) : ?>
					<button class="burger" type="button" data-menu-toggle aria-controls="sib-mmenu" aria-expanded="false" aria-label="<?php esc_attr_e( 'Open menu', 'shopinbos' ); ?>">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16141F" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
					</button>
				<?php endif; ?>
			</div>
		</div>
		<?php if ( empty( $attrs['minimal'] ) ) : ?>
			<div class="mmenu" id="sib-mmenu" hidden>
				<div class="wrap">
					<?php foreach ( $links as [ $label, $url ] ) : ?>
						<a class="mlink arrow" href="<?php echo esc_url( $url ); ?>"><?php echo esc_html( $label ); ?></a>
					<?php endforeach; ?>
					<div style="display:flex;gap:10px;margin-top:18px">
						<a class="btn btn-ghost" style="flex:1" href="<?php echo esc_url( sib_theme_go( 'login' ) ); ?>"><?php esc_html_e( 'Log in', 'shopinbos' ); ?></a>
						<a class="btn btn-acc" style="flex:1" href="<?php echo esc_url( sib_theme_go( '', [ 'place' => 'menu' ] ) ); ?>"><?php esc_html_e( 'Start your shop', 'shopinbos' ); ?></a>
					</div>
				</div>
			</div>
		<?php endif; ?>
	</header>
	<?php
	return (string) ob_get_clean();
}

function sib_theme_render_footer( array $attrs ): string {
	$year = wp_date( 'Y' );
	if ( ! empty( $attrs['minimal'] ) ) {
		return '<footer class="foot"><div class="wrap foot-base" style="border:0;padding:28px 32px">'
			. '<span>© ' . esc_html( $year ) . ' Shopinbos.</span>'
			. '<span><a href="' . esc_url( home_url( '/legal/privacy/' ) ) . '">' . esc_html__( 'Privacy', 'shopinbos' ) . '</a></span></div></footer>';
	}
	$cols = [
		[ __( 'Sell', 'shopinbos' ), 'footer_sell', [
			[ __( 'How it works', 'shopinbos' ), home_url( '/' ) ],
			[ __( 'Templates', 'shopinbos' ), home_url( '/templates/' ) ],
			[ __( 'Find stock', 'shopinbos' ), home_url( '/marketplace/' ) ],
			[ __( 'Pricing', 'shopinbos' ), home_url( '/pricing/' ) ],
			[ __( 'Features', 'shopinbos' ), home_url( '/features/' ) ],
			[ __( 'Free tools', 'shopinbos' ), home_url( '/tools/' ) ],
		] ],
		[ __( 'Join', 'shopinbos' ), 'footer_join', [
			[ __( 'Become a supplier', 'shopinbos' ), home_url( '/for-suppliers/' ) ],
			[ __( 'Delivery companies', 'shopinbos' ), home_url( '/delivery/' ) ],
			[ __( 'Ride with Shopinbos', 'shopinbos' ), home_url( '/delivery/#riders' ) ],
		] ],
		[ __( 'Learn', 'shopinbos' ), 'footer_company', [
			[ __( 'Blog', 'shopinbos' ), home_url( '/blog/' ) ],
			[ __( 'Academy', 'shopinbos' ), home_url( '/academy/' ) ],
			[ __( 'Guides and PDFs', 'shopinbos' ), home_url( '/resources/' ) ],
			[ __( 'Help centre', 'shopinbos' ), home_url( '/help/' ) ],
			[ __( 'About us', 'shopinbos' ), home_url( '/about/' ) ],
			[ __( 'Contact', 'shopinbos' ), home_url( '/contact/' ) ],
		] ],
	];
	$apps = function_exists( 'sib_setting' ) ? [ sib_setting( 'ios_url' ), sib_setting( 'android_url' ) ] : [ '', '' ];
	ob_start();
	?>
	<footer class="foot">
		<div class="wrap" style="padding-top:64px;padding-bottom:40px;display:flex;flex-direction:column;gap:44px">
			<div class="foot-grid">
				<div class="foot-col" style="gap:14px">
					<img src="<?php echo sib_theme_img( 'logo-light.png' ); ?>" alt="Shopinbos" width="168" height="16" style="height:16px;width:auto;align-self:flex-start">
					<p style="margin:0;color:var(--fog);font-size:14px;line-height:1.6"><?php esc_html_e( 'The commerce app for Nigerian businesses. Made in Lagos.', 'shopinbos' ); ?></p>
				</div>
				<?php foreach ( $cols as [ $title, $location, $defaults ] ) : ?>
					<nav class="foot-col" aria-label="<?php echo esc_attr( $title ); ?>">
						<b><?php echo esc_html( $title ); ?></b>
						<?php foreach ( sib_theme_menu_links( $location, $defaults ) as [ $label, $url ] ) : ?>
							<a href="<?php echo esc_url( $url ); ?>"><?php echo esc_html( $label ); ?></a>
						<?php endforeach; ?>
					</nav>
				<?php endforeach; ?>
				<div class="foot-col">
					<b><?php esc_html_e( 'Get the app', 'shopinbos' ); ?></b>
					<?php foreach ( [ [ 'iPhone', $apps[0] ], [ 'Android', $apps[1] ] ] as [ $label, $url ] ) : ?>
						<a class="row" style="gap:8px" href="<?php echo esc_url( $url ?: sib_theme_go( '', [ 'place' => 'footer_app' ] ) ); ?>">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9C6D3" stroke-width="1.8" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/></svg><?php echo esc_html( $label ); ?>
						</a>
					<?php endforeach; ?>
					<a href="<?php echo esc_url( home_url( '/legal/privacy/' ) ); ?>"><?php esc_html_e( 'Privacy', 'shopinbos' ); ?></a>
					<a href="<?php echo esc_url( home_url( '/legal/terms/' ) ); ?>"><?php esc_html_e( 'Terms', 'shopinbos' ); ?></a>
				</div>
			</div>
			<div class="foot-base">
				<span>© <?php echo esc_html( $year ); ?> Shopinbos. <?php esc_html_e( 'All rights reserved.', 'shopinbos' ); ?></span>
				<span><?php esc_html_e( 'Payments by Paystack · Data handled under the NDPA 2023', 'shopinbos' ); ?></span>
			</div>
		</div>
	</footer>
	<?php
	return (string) ob_get_clean();
}
