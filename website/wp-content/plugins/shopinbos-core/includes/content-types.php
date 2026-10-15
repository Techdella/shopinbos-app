<?php
/**
 * Content types from the website plan. Each one starts from a block template built from the
 * theme's patterns, so a writer fills in the blanks and pages stay consistent.
 *
 *   /features/{feature}        /solutions/{goal}      /industries/{industry}
 *   /sell-online/{city}        /compare/{other}       /integrations/{app}
 *   /templates/{template}      /tools/{tool}          /resources/{guide}
 *   /help/{category}/{article} /lp/{campaign} (noindex)
 *
 * Blog posts live at /blog/{post} (permalink structure set by `wp shopinbos setup`).
 */

defined( 'ABSPATH' ) || exit;

function sib_content_types(): array {
	$p = fn( $slug ) => [ 'core/pattern', [ 'slug' => 'shopinbos/' . $slug ] ];
	return [
		'sib_feature'     => [ __( 'Features', 'shopinbos' ), __( 'Feature', 'shopinbos' ), 'features', 'dashicons-star-filled', [ $p( 'feature-hero' ), $p( 'benefit-grid' ), $p( 'sticky-steps' ), $p( 'faq-section' ) ] ],
		'sib_solution'    => [ __( 'Solutions', 'shopinbos' ), __( 'Solution', 'shopinbos' ), 'solutions', 'dashicons-lightbulb', [ $p( 'feature-hero' ), $p( 'sticky-steps' ), $p( 'chat-bubble' ), $p( 'quote' ), $p( 'faq-section' ) ] ],
		'sib_industry'    => [ __( 'Industries', 'shopinbos' ), __( 'Industry', 'shopinbos' ), 'industries', 'dashicons-store', [ $p( 'feature-hero' ), $p( 'bento-grid' ), $p( 'product-strip' ), $p( 'faq-section' ) ] ],
		'sib_city'        => [ __( 'Cities', 'shopinbos' ), __( 'City', 'shopinbos' ), 'sell-online', 'dashicons-location', [ $p( 'feature-hero' ), [ 'shopinbos/partner-grid', [] ], $p( 'faq-section' ) ] ],
		'sib_comparison'  => [ __( 'Comparisons', 'shopinbos' ), __( 'Comparison', 'shopinbos' ), 'compare', 'dashicons-columns', [ $p( 'feature-hero' ), $p( 'comparison-table' ), $p( 'sticky-steps' ), $p( 'faq-section' ) ] ],
		'sib_integration' => [ __( 'Integrations', 'shopinbos' ), __( 'Integration', 'shopinbos' ), 'integrations', 'dashicons-admin-links', [ $p( 'feature-hero' ), $p( 'sticky-steps' ), $p( 'faq-section' ) ] ],
		'sib_template'    => [ __( 'Store templates', 'shopinbos' ), __( 'Store template', 'shopinbos' ), 'templates', 'dashicons-layout', [ [ 'core/paragraph', [ 'placeholder' => __( 'Who this template suits and what makes it different.', 'shopinbos' ) ] ] ] ],
		'sib_tool'        => [ __( 'Free tools', 'shopinbos' ), __( 'Tool', 'shopinbos' ), 'tools', 'dashicons-calculator', [ [ 'core/heading', [ 'content' => __( 'How to use it', 'shopinbos' ) ] ], [ 'core/paragraph', [] ], $p( 'faq-section' ) ] ],
		'sib_resource'    => [ __( 'Guides and PDFs', 'shopinbos' ), __( 'Guide', 'shopinbos' ), 'resources', 'dashicons-media-document', [ [ 'core/heading', [ 'content' => __( 'What’s inside', 'shopinbos' ) ] ], [ 'core/list', [] ] ] ],
		'sib_help'        => [ __( 'Help articles', 'shopinbos' ), __( 'Help article', 'shopinbos' ), 'help/%sib_help_category%', 'dashicons-sos', [ [ 'core/paragraph', [ 'placeholder' => __( 'Answer the question in the first sentence.', 'shopinbos' ) ] ], [ 'core/list', [ 'ordered' => true ] ] ] ],
		'sib_landing'     => [ __( 'Campaign pages', 'shopinbos' ), __( 'Campaign page', 'shopinbos' ), 'lp', 'dashicons-megaphone', [ $p( 'feature-hero' ), $p( 'benefit-grid' ), $p( 'cta-band' ) ] ],
	];
}

function sib_register_content_types(): void {
	register_taxonomy( 'sib_help_category', [ 'sib_help' ], [
		'labels'            => [ 'name' => __( 'Help categories', 'shopinbos' ), 'singular_name' => __( 'Help category', 'shopinbos' ) ],
		'hierarchical'      => true,
		'show_in_rest'      => true,
		'show_admin_column' => true,
		'rewrite'           => [ 'slug' => 'help', 'with_front' => false, 'hierarchical' => false ],
	] );
	add_rewrite_tag( '%sib_help_category%', '([^/]+)', 'sib_help_category=' );

	foreach ( sib_content_types() as $type => [ $plural, $singular, $slug, $icon, $template ] ) {
		$archive = match ( $type ) {
			'sib_help'    => 'help',
			'sib_landing' => false,
			default       => $slug,
		};
		register_post_type( $type, [
			'labels'              => [
				'name'          => $plural,
				'singular_name' => $singular,
				'add_new_item'  => sprintf( __( 'Add %s', 'shopinbos' ), strtolower( $singular ) ),
				'edit_item'     => sprintf( __( 'Edit %s', 'shopinbos' ), strtolower( $singular ) ),
				'all_items'     => $plural,
			],
			'public'              => true,
			'show_in_rest'        => true,
			'menu_icon'           => $icon,
			'menu_position'       => 21,
			'has_archive'         => $archive,
			'rewrite'             => [ 'slug' => $slug, 'with_front' => false ],
			'supports'            => [ 'title', 'editor', 'excerpt', 'thumbnail', 'revisions', 'custom-fields', 'author', 'page-attributes' ],
			'template'            => $template,
			'exclude_from_search' => 'sib_landing' === $type,
			'map_meta_cap'        => true,
		] );
	}
}
add_action( 'init', 'sib_register_content_types', 5 );

/* /help/{category}/{article}: put the article's first help category in its link. */
add_filter( 'post_type_link', function ( $link, $post ) {
	if ( 'sib_help' !== $post->post_type || ! str_contains( $link, '%sib_help_category%' ) ) {
		return $link;
	}
	$terms = get_the_terms( $post, 'sib_help_category' );
	$slug  = ( $terms && ! is_wp_error( $terms ) ) ? $terms[0]->slug : 'general';
	return str_replace( '%sib_help_category%', $slug, $link );
}, 10, 2 );

/* Archive sizes and order. */
add_action( 'pre_get_posts', function ( WP_Query $q ) {
	if ( is_admin() || ! $q->is_main_query() ) {
		return;
	}
	if ( $q->is_post_type_archive( [ 'sib_feature', 'sib_solution', 'sib_industry', 'sib_city', 'sib_integration', 'sib_tool', 'sib_resource', 'sib_comparison' ] ) ) {
		$q->set( 'posts_per_page', 48 );
		$q->set( 'orderby', [ 'menu_order' => 'ASC', 'title' => 'ASC' ] );
	}
	if ( $q->is_post_type_archive( 'sib_template' ) ) {
		$q->set( 'posts_per_page', 48 );
		$q->set( 'orderby', [ 'menu_order' => 'ASC', 'date' => 'ASC' ] );
	}
} );

/* Archive titles without "Archives:". */
add_filter( 'get_the_archive_title_prefix', '__return_empty_string' );
