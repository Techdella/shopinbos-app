<?php
/**
 * Page settings: the shared fields every page type carries (primary CTA intent, noindex,
 * last reviewed, reviewed by) plus per-type fields (template colours, which tool, gated file…).
 * Shown in a "Shopinbos" box under the editor.
 */

defined( 'ABSPATH' ) || exit;

function sib_intents(): array {
	return [
		''              => __( 'Default: start a shop', 'shopinbos' ),
		'add'           => 'add',
		'dropship'      => 'dropship',
		'request_quote' => 'request_quote',
		'template'      => 'template',
		'plan'          => 'plan',
		'book_delivery' => 'book_delivery',
		'supplier_signup' => 'supplier_signup',
		'partner_signup'  => 'partner_signup',
		'tool_result'   => 'tool_result',
	];
}

function sib_tools_list(): array {
	return [
		'profit-margin' => __( 'Profit margin calculator', 'shopinbos' ),
		'selling-price' => __( 'Selling price calculator', 'shopinbos' ),
		'paystack-fee'  => __( 'Paystack fee calculator', 'shopinbos' ),
		'whatsapp-link' => __( 'WhatsApp link and QR maker', 'shopinbos' ),
		'landed-cost'   => __( 'Landed cost calculator (China)', 'shopinbos' ),
		'break-even'    => __( 'Break-even calculator', 'shopinbos' ),
		'discount'      => __( 'Discount and sale calculator', 'shopinbos' ),
		'ad-budget'     => __( 'Ad budget calculator', 'shopinbos' ),
		'business-name' => __( 'Business name generator', 'shopinbos' ),
		'product-description' => __( 'Product description writer', 'shopinbos' ),
	];
}

/** Field definitions: key => [label, type, post types (empty = all), options/help]. */
function sib_meta_fields(): array {
	$content = [ 'post', 'page', 'sib_feature', 'sib_solution', 'sib_industry', 'sib_city', 'sib_comparison', 'sib_integration', 'sib_template', 'sib_tool', 'sib_resource', 'sib_help', 'sib_landing' ];
	return [
		'sib_cta_intent'   => [ __( 'Primary sign-up intent', 'shopinbos' ), 'select', $content, sib_intents() ],
		'sib_cta_args'     => [ __( 'Intent details', 'shopinbos' ), 'text', $content, __( 'Extra sign-up parameters, e.g. template=breeze or plan=growth', 'shopinbos' ) ],
		'sib_noindex'      => [ __( 'Hide from search engines (noindex)', 'shopinbos' ), 'checkbox', $content, '' ],
		'sib_reviewed'     => [ __( 'Last reviewed', 'shopinbos' ), 'date', $content, __( 'Shown on the page as "Updated" or "Last checked".', 'shopinbos' ) ],
		'sib_reviewed_by'  => [ __( 'Reviewed by', 'shopinbos' ), 'text', [ 'post', 'sib_help', 'sib_resource' ], __( 'Required for money, legal and tax topics. Name and role, e.g. "Ada Obi, chartered accountant".', 'shopinbos' ) ],
		'sib_tpl_key'      => [ __( 'Template key in the app', 'shopinbos' ), 'text', [ 'sib_template' ], __( 'e.g. breeze. Sent to the app when someone taps "Use this".', 'shopinbos' ) ],
		'sib_tpl_kind'     => [ __( 'Best for', 'shopinbos' ), 'text', [ 'sib_template' ], __( 'Fashion, Luxury, Shoes, Food and drinks, Home and living, Gadgets, Any shop', 'shopinbos' ) ],
		'sib_tpl_bg'       => [ __( 'Card background colour', 'shopinbos' ), 'color', [ 'sib_template' ], '' ],
		'sib_tpl_ink'      => [ __( 'Card text colour', 'shopinbos' ), 'color', [ 'sib_template' ], '' ],
		'sib_tpl_demo'     => [ __( 'Live demo store URL', 'shopinbos' ), 'url', [ 'sib_template' ], '' ],
		'sib_tool'         => [ __( 'Which tool', 'shopinbos' ), 'select', [ 'sib_tool' ], sib_tools_list() ],
		'sib_integration_status' => [ __( 'Status', 'shopinbos' ), 'select', [ 'sib_integration' ], [ 'live' => 'Live', 'apply' => 'Apply', 'soon' => 'Soon' ] ],
		'sib_help_area'    => [ __( 'App area', 'shopinbos' ), 'text', [ 'sib_help' ], __( 'Where in the app this applies, e.g. Orders > Pay on delivery. The app links to this article by its slug: never change the slug without a redirect.', 'shopinbos' ) ],
		'sib_gated'        => [ __( 'Ask for details before download', 'shopinbos' ), 'checkbox', [ 'sib_resource' ], '' ],
		'sib_file_id'      => [ __( 'PDF file', 'shopinbos' ), 'file', [ 'sib_resource' ], __( 'Pick from the media library. On save it moves to a private folder and is only sent by signed link.', 'shopinbos' ) ],
		'sib_list_tag'     => [ __( 'Email list tag', 'shopinbos' ), 'text', [ 'sib_resource' ], __( 'e.g. whatsapp-playbook', 'shopinbos' ) ],
	];
}

add_action( 'init', function () {
	foreach ( sib_meta_fields() as $key => [ , $type, $types ] ) {
		foreach ( $types as $pt ) {
			register_post_meta( $pt, $key, [
				'type'          => 'checkbox' === $type ? 'boolean' : ( 'file' === $type ? 'integer' : 'string' ),
				'single'        => true,
				'show_in_rest'  => true,
				'auth_callback' => fn() => current_user_can( 'edit_posts' ),
			] );
		}
	}
	// Set on save, read by downloads. Not editable from the REST API.
	register_post_meta( 'sib_resource', 'sib_file_path', [ 'type' => 'string', 'single' => true, 'show_in_rest' => false ] );
}, 20 );

add_action( 'add_meta_boxes', function ( $post_type ) {
	$fields = array_filter( sib_meta_fields(), fn( $f ) => in_array( $post_type, $f[2], true ) );
	if ( $fields ) {
		add_meta_box( 'sib-meta', 'Shopinbos', 'sib_meta_box', $post_type, 'normal', 'default', [ 'fields' => $fields ] );
	}
} );

function sib_meta_box( WP_Post $post, array $box ): void {
	wp_nonce_field( 'sib_meta', 'sib_meta_nonce' );
	echo '<table class="form-table" role="presentation">';
	foreach ( $box['args']['fields'] as $key => [ $label, $type, , $extra ] ) {
		$v  = get_post_meta( $post->ID, $key, true );
		$id = 'sib-' . $key;
		echo '<tr><th scope="row"><label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label></th><td>';
		switch ( $type ) {
			case 'select':
				echo '<select id="' . esc_attr( $id ) . '" name="' . esc_attr( $key ) . '">';
				foreach ( (array) $extra as $k => $l ) {
					echo '<option value="' . esc_attr( $k ) . '"' . selected( $v, $k, false ) . '>' . esc_html( $l ) . '</option>';
				}
				echo '</select>';
				$extra = '';
				break;
			case 'checkbox':
				echo '<input type="checkbox" id="' . esc_attr( $id ) . '" name="' . esc_attr( $key ) . '" value="1"' . checked( (bool) $v, true, false ) . '>';
				break;
			case 'file':
				$path = get_post_meta( $post->ID, 'sib_file_path', true );
				echo '<input type="hidden" id="' . esc_attr( $id ) . '" name="' . esc_attr( $key ) . '" value="' . esc_attr( (string) $v ) . '">';
				echo '<button type="button" class="button" data-sib-pick="' . esc_attr( $id ) . '">' . esc_html__( 'Choose PDF', 'shopinbos' ) . '</button> ';
				echo '<span data-sib-picked="' . esc_attr( $id ) . '">' . esc_html( $path ? basename( $path ) . ' ' . __( '(stored privately)', 'shopinbos' ) : __( 'No file yet', 'shopinbos' ) ) . '</span>';
				break;
			default:
				$input = [ 'date' => 'date', 'url' => 'url', 'color' => 'text' ][ $type ] ?? 'text';
				echo '<input class="regular-text" type="' . esc_attr( $input ) . '" id="' . esc_attr( $id ) . '" name="' . esc_attr( $key ) . '" value="' . esc_attr( (string) $v ) . '"' . ( 'color' === $type ? ' placeholder="#F3EDE6" pattern="#[0-9A-Fa-f]{6}"' : '' ) . '>';
		}
		if ( is_string( $extra ) && $extra ) {
			echo '<p class="description">' . esc_html( $extra ) . '</p>';
		}
		echo '</td></tr>';
	}
	echo '</table>';
}

add_action( 'admin_enqueue_scripts', function ( $hook ) {
	if ( ! in_array( $hook, [ 'post.php', 'post-new.php' ], true ) || 'sib_resource' !== get_current_screen()->post_type ) {
		return;
	}
	wp_enqueue_media();
	wp_add_inline_script( 'media-editor', <<<'JS'
document.addEventListener('click', function (e) {
	var btn = e.target.closest('[data-sib-pick]');
	if (!btn) return;
	e.preventDefault();
	var id = btn.getAttribute('data-sib-pick');
	var frame = wp.media({ title: 'Choose the PDF', library: { type: 'application/pdf' }, multiple: false });
	frame.on('select', function () {
		var a = frame.state().get('selection').first().toJSON();
		document.getElementById(id).value = a.id;
		document.querySelector('[data-sib-picked="' + id + '"]').textContent = a.filename + ' (moves to private storage on save)';
	});
	frame.open();
});
JS
	);
} );

add_action( 'save_post', function ( $post_id, $post ) {
	if ( ! isset( $_POST['sib_meta_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['sib_meta_nonce'] ), 'sib_meta' ) ) {
		return;
	}
	if ( wp_is_post_revision( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	foreach ( sib_meta_fields() as $key => [ , $type, $types, $extra ] ) {
		if ( ! in_array( $post->post_type, $types, true ) ) {
			continue;
		}
		$raw = wp_unslash( $_POST[ $key ] ?? '' );
		switch ( $type ) {
			case 'checkbox':
				$val = ! empty( $raw );
				break;
			case 'select':
				$val = array_key_exists( (string) $raw, (array) $extra ) ? (string) $raw : '';
				break;
			case 'date':
				$val = preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $raw ) ? (string) $raw : '';
				break;
			case 'url':
				$val = esc_url_raw( (string) $raw );
				break;
			case 'color':
				$val = preg_match( '/^#[0-9A-Fa-f]{6}$/', (string) $raw ) ? (string) $raw : '';
				break;
			case 'file':
				$val = absint( $raw );
				break;
			default:
				$val = sanitize_text_field( (string) $raw );
		}
		if ( '' === $val || false === $val || 0 === $val ) {
			delete_post_meta( $post_id, $key );
		} else {
			update_post_meta( $post_id, $key, $val );
		}
	}
	if ( 'sib_resource' === $post->post_type ) {
		sib_secure_resource_file( $post_id );
	}
}, 10, 2 );

/** The page's primary sign-up link, from the shared CTA fields. */
function sib_post_cta_url( ?int $post_id = null, string $place = '' ): string {
	$post_id = $post_id ?: get_the_ID();
	$intent  = (string) get_post_meta( $post_id, 'sib_cta_intent', true );
	parse_str( (string) get_post_meta( $post_id, 'sib_cta_args', true ), $args );
	return sib_go_url( $intent, array_filter( (array) $args, 'is_string' ) + ( $place ? [ 'place' => $place ] : [] ) );
}
