<?php
/**
 * One "Website" menu in the admin for everything the team edits on shopinbos.com: landing pages (features,
 * solutions, industries, cities, integrations, campaigns), compare pages, store templates, free tools, guides
 * and PDFs, help articles, Academy lessons and Gist stories. Its first screen shows each type with counts and
 * quick links. Blog posts stay under Posts.
 */

defined( 'ABSPATH' ) || exit;

/** Content types in the Website menu, in order, with the label the team sees. */
function sib_admin_types(): array {
	return [
		'sib_feature'     => [ __( 'Feature pages', 'shopinbos' ), __( 'Landing pages', 'shopinbos' ) ],
		'sib_solution'    => [ __( 'Solution pages', 'shopinbos' ), __( 'Landing pages', 'shopinbos' ) ],
		'sib_industry'    => [ __( 'Industry pages', 'shopinbos' ), __( 'Landing pages', 'shopinbos' ) ],
		'sib_city'        => [ __( 'City pages', 'shopinbos' ), __( 'Landing pages', 'shopinbos' ) ],
		'sib_integration' => [ __( 'Integration pages', 'shopinbos' ), __( 'Landing pages', 'shopinbos' ) ],
		'sib_landing'     => [ __( 'Campaign pages', 'shopinbos' ), __( 'Landing pages', 'shopinbos' ) ],
		'sib_comparison'  => [ __( 'Compare pages', 'shopinbos' ), __( 'Landing pages', 'shopinbos' ) ],
		'sib_template'    => [ __( 'Store templates', 'shopinbos' ), __( 'Product', 'shopinbos' ) ],
		'sib_tool'        => [ __( 'Free tools', 'shopinbos' ), __( 'Learn', 'shopinbos' ) ],
		'sib_resource'    => [ __( 'Guides and PDFs', 'shopinbos' ), __( 'Learn', 'shopinbos' ) ],
		'sib_lesson'      => [ __( 'Academy lessons', 'shopinbos' ), __( 'Learn', 'shopinbos' ) ],
		'sib_gist'        => [ __( 'Gist stories', 'shopinbos' ), __( 'Learn', 'shopinbos' ) ],
		'sib_help'        => [ __( 'Help articles', 'shopinbos' ), __( 'Support', 'shopinbos' ) ],
	];
}

/* Put the content types under the Website menu, with clear names. */
add_filter( 'register_post_type_args', function ( array $args, string $type ) {
	$types = sib_admin_types();
	if ( isset( $types[ $type ] ) ) {
		$args['show_ui']               = true;
		$args['show_in_menu']          = 'sib-website';
		$args['labels']['all_items']   = $types[ $type ][0];
		$args['labels']['menu_name']   = $types[ $type ][0];
	}
	return $args;
}, 10, 2 );

add_action( 'admin_menu', function () {
	add_menu_page( __( 'Shopinbos website', 'shopinbos' ), __( 'Website', 'shopinbos' ), 'edit_posts', 'sib-website', 'sib_admin_overview', 'dashicons-admin-site-alt3', 21 );
	add_submenu_page( 'sib-website', __( 'Shopinbos website', 'shopinbos' ), __( 'Overview', 'shopinbos' ), 'edit_posts', 'sib-website', 'sib_admin_overview', 0 );
	add_submenu_page( 'sib-website', __( 'Academy tracks', 'shopinbos' ), __( 'Academy tracks', 'shopinbos' ), 'manage_categories', 'edit-tags.php?taxonomy=sib_track&post_type=sib_lesson' );
	add_submenu_page( 'sib-website', __( 'Help topics', 'shopinbos' ), __( 'Help topics', 'shopinbos' ), 'manage_categories', 'edit-tags.php?taxonomy=sib_help_category&post_type=sib_help' );
	add_submenu_page( 'sib-website', __( 'Settings', 'shopinbos' ), __( 'Settings', 'shopinbos' ), 'manage_options', 'options-general.php?page=shopinbos' );
}, 9 );

/* Keep the Website menu open on the track and help topic screens. */
add_filter( 'parent_file', function ( $file ) {
	$tax = $GLOBALS['taxnow'] ?? '';
	return in_array( $tax, [ 'sib_track', 'sib_help_category' ], true ) ? 'sib-website' : $file;
} );

/* Order the submenu: overview, then the types in sib_admin_types() order, tracks after lessons, topics after help. */
add_action( 'admin_menu', function () {
	global $submenu;
	if ( empty( $submenu['sib-website'] ) ) {
		return;
	}
	$order = [ 'sib-website' ];
	foreach ( array_keys( sib_admin_types() ) as $type ) {
		$order[] = 'edit.php?post_type=' . $type;
		if ( 'sib_lesson' === $type ) {
			$order[] = 'edit-tags.php?taxonomy=sib_track&post_type=sib_lesson';
		}
		if ( 'sib_help' === $type ) {
			$order[] = 'edit-tags.php?taxonomy=sib_help_category&post_type=sib_help';
		}
	}
	$order[] = 'options-general.php?page=shopinbos';
	$rank    = array_flip( $order );
	usort( $submenu['sib-website'], fn( $a, $b ) => ( $rank[ $a[2] ] ?? 999 ) <=> ( $rank[ $b[2] ] ?? 999 ) );
}, 999 );

function sib_admin_overview(): void {
	$groups = [];
	foreach ( sib_admin_types() as $type => [ $label, $group ] ) {
		if ( post_type_exists( $type ) ) {
			$groups[ $group ][ $type ] = $label;
		}
	}
	echo '<div class="wrap"><h1>' . esc_html__( 'Shopinbos website', 'shopinbos' ) . '</h1><p style="max-width:720px">' . esc_html__( 'Everything you can edit on shopinbos.com, in one place. Blog posts are under Posts, and the main pages (home, pricing, about) under Pages.', 'shopinbos' ) . '</p>';
	echo '<style>.sibw{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin:10px 0 26px}.sibw .c{background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:8px}.sibw b{font-size:15px}.sibw .n{color:#646970}.sibw .l{display:flex;gap:12px;flex-wrap:wrap;margin-top:auto}</style>';
	foreach ( $groups as $group => $types ) {
		echo '<h2>' . esc_html( $group ) . '</h2><div class="sibw">';
		foreach ( $types as $type => $label ) {
			$c    = wp_count_posts( $type );
			$obj  = get_post_type_object( $type );
			$view = $obj->public && $obj->has_archive ? get_post_type_archive_link( $type ) : ( 'sib_gist' === $type ? home_url( '/gist/' ) : '' );
			echo '<div class="c"><b>' . esc_html( $label ) . '</b><span class="n">' . esc_html( sprintf( __( '%1$d published, %2$d draft', 'shopinbos' ), (int) ( $c->publish ?? 0 ) + (int) ( $c->future ?? 0 ), (int) ( $c->draft ?? 0 ) ) ) . '</span><span class="l">'
				. '<a href="' . esc_url( admin_url( 'edit.php?post_type=' . $type ) ) . '">' . esc_html__( 'View all', 'shopinbos' ) . '</a>'
				. ( current_user_can( $obj->cap->create_posts ) ? '<a href="' . esc_url( admin_url( 'post-new.php?post_type=' . $type ) ) . '">' . esc_html__( 'Add new', 'shopinbos' ) . '</a>' : '' )
				. ( $view ? '<a href="' . esc_url( $view ) . '" target="_blank" rel="noopener">' . esc_html__( 'See on site', 'shopinbos' ) . '</a>' : '' ) . '</span></div>';
		}
		echo '</div>';
	}
	echo '</div>';
}
