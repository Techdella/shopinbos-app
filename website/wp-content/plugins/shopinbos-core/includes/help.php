<?php
/**
 * Help centre: search across help, blog and guides, category grid, sidebar, "Was this helpful?"
 * votes and the WhatsApp "Chat with us" button. Articles are also readable as JSON from
 * /wp-json/wp/v2/sib_help so Peggy can answer from them later.
 */

defined( 'ABSPATH' ) || exit;

function sib_whatsapp_url( string $text = '' ): string {
	$n = preg_replace( '/\D/', '', (string) sib_setting( 'whatsapp_support' ) );
	return $n ? 'https://wa.me/' . $n . ( $text ? '?text=' . rawurlencode( $text ) : '' ) : home_url( '/contact/' );
}

function sib_render_help_search(): string {
	$id = wp_unique_id( 'sib-hs-' );
	ob_start();
	?>
	<form class="card searchbar" role="search" action="<?php echo esc_url( home_url( '/' ) ); ?>" method="get" style="max-width:680px;position:relative" data-help-search>
		<?php echo sib_icon( 'search', 20, '#6B6779' ); // phpcs:ignore ?>
		<label for="<?php echo esc_attr( $id ); ?>" class="screen-reader-text"><?php esc_html_e( 'Search help', 'shopinbos' ); ?></label>
		<input id="<?php echo esc_attr( $id ); ?>" name="s" type="search" autocomplete="off" placeholder="<?php esc_attr_e( 'Search, e.g. when do I get paid', 'shopinbos' ); ?>" style="color:#16141F" aria-controls="<?php echo esc_attr( $id ); ?>-list">
		<input type="hidden" name="post_type[]" value="sib_help"><input type="hidden" name="post_type[]" value="post"><input type="hidden" name="post_type[]" value="sib_resource">
		<button class="btn btn-ink btn-s" type="submit"><?php esc_html_e( 'Search', 'shopinbos' ); ?></button>
		<ul id="<?php echo esc_attr( $id ); ?>-list" class="card" role="listbox" hidden style="position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:5;list-style:none;margin:0;padding:8px;color:#16141F;max-height:360px;overflow:auto"></ul>
	</form>
	<script>
	(function () {
		var f = document.currentScript.previousElementSibling, input = f.querySelector('input[name=s]'), list = f.querySelector('[role=listbox]'), t;
		var labels = { sib_help: 'Help', post: 'Blog', sib_resource: 'Guide' };
		input.addEventListener('input', function () {
			clearTimeout(t);
			var q = input.value.trim();
			if (q.length < 3) { list.hidden = true; return; }
			t = setTimeout(function () {
				fetch('<?php echo esc_url_raw( rest_url( 'wp/v2/search' ) ); ?>?per_page=8&type=post&subtype=sib_help,post,sib_resource&search=' + encodeURIComponent(q))
					.then(function (r) { return r.json(); })
					.then(function (rows) {
						list.innerHTML = '';
						rows.forEach(function (r) {
							var li = document.createElement('li'), a = document.createElement('a');
							a.href = r.url; a.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:12px;text-decoration:none;color:inherit;font-weight:600';
							a.innerHTML = '<span></span><span class="tag"></span>';
							a.firstChild.textContent = r.title; a.lastChild.textContent = labels[r.subtype] || '';
							li.appendChild(a); list.appendChild(li);
						});
						list.hidden = !rows.length;
					}).catch(function () {});
			}, 220);
		});
		document.addEventListener('click', function (e) { if (!f.contains(e.target)) list.hidden = true; });
	})();
	</script>
	<?php
	return (string) ob_get_clean();
}

function sib_render_help_categories(): string {
	$terms = get_terms( [ 'taxonomy' => 'sib_help_category', 'hide_empty' => true, 'parent' => 0 ] );
	if ( ! $terms || is_wp_error( $terms ) ) {
		return '';
	}
	$groups = [ 'seller' => [], 'supplier' => [], 'partner' => [] ];
	foreach ( $terms as $t ) {
		$aud              = str_starts_with( $t->slug, 'supplier' ) ? 'supplier' : ( str_starts_with( $t->slug, 'delivery-partner' ) ? 'partner' : 'seller' );
		$groups[ $aud ][] = $t;
	}
	$titles = [ 'seller' => __( 'For sellers', 'shopinbos' ), 'supplier' => __( 'For suppliers', 'shopinbos' ), 'partner' => __( 'For delivery partners', 'shopinbos' ) ];
	$out    = '<div class="col-22" style="gap:48px">';
	foreach ( $groups as $aud => $list ) {
		if ( ! $list ) {
			continue;
		}
		$out .= '<div class="col"><h2 class="disp h3">' . esc_html( $titles[ $aud ] ) . '</h2><div class="g3">';
		foreach ( $list as $t ) {
			$top  = get_posts( [ 'post_type' => 'sib_help', 'numberposts' => 3, 'tax_query' => [ [ 'taxonomy' => 'sib_help_category', 'terms' => $t->term_id ] ], 'orderby' => 'menu_order title', 'order' => 'ASC' ] );
			$out .= '<div class="card" style="padding:22px;display:flex;flex-direction:column;gap:10px"><a href="' . esc_url( get_term_link( $t ) ) . '" style="text-decoration:none;color:inherit"><b style="font-size:17px">' . esc_html( $t->name ) . '</b></a>'
				. ( $t->description ? '<p class="p" style="font-size:14px">' . esc_html( $t->description ) . '</p>' : '' );
			foreach ( $top as $p ) {
				$out .= '<a class="lnk" style="font-weight:600;color:#6B6779" href="' . esc_url( get_permalink( $p ) ) . '">' . esc_html( get_the_title( $p ) ) . '</a>';
			}
			$out .= '<a class="lnk arrow" style="margin-top:auto" href="' . esc_url( get_term_link( $t ) ) . '">' . esc_html( sprintf( _n( '%d article', 'All %d articles', $t->count, 'shopinbos' ), $t->count ) ) . '</a></div>';
		}
		$out .= '</div></div>';
	}
	$out .= '<div style="background:#0C4A44;color:#fff;border-radius:24px;padding:22px;display:flex;gap:16px;align-items:center;flex-wrap:wrap"><img src="' . sib_img( 'peggy.webp' ) . '" alt="" width="56" height="56"><p style="margin:0;flex:1;min-width:220px;color:#E6FBF6">' . esc_html__( 'Can’t find it? Message us on WhatsApp. A real person replies, in English or Pidgin.', 'shopinbos' ) . '</p><a class="btn btn-acc" href="' . esc_url( sib_whatsapp_url( 'Hi Shopinbos, I need help with' ) ) . '" rel="noopener">' . esc_html__( 'Chat with us', 'shopinbos' ) . '</a></div>';
	return $out . '</div>';
}

function sib_render_help_nav(): string {
	$terms = get_terms( [ 'taxonomy' => 'sib_help_category', 'hide_empty' => true ] );
	$cur   = is_tax( 'sib_help_category' ) ? get_queried_object_id() : 0;
	if ( is_singular( 'sib_help' ) ) {
		$own = wp_get_object_terms( get_the_ID(), 'sib_help_category', [ 'fields' => 'ids' ] );
		$cur = $own ? $own[0] : 0;
	}
	$out = '<aside><nav class="help-side" aria-label="' . esc_attr__( 'Help categories', 'shopinbos' ) . '"><a href="' . esc_url( home_url( '/help/' ) ) . '" style="color:#16141F;font-weight:800">' . esc_html__( 'Help centre', 'shopinbos' ) . '</a>';
	foreach ( (array) $terms as $t ) {
		$out .= '<a href="' . esc_url( get_term_link( $t ) ) . '"' . ( $cur === $t->term_id ? ' aria-current="page"' : '' ) . '>' . esc_html( $t->name ) . '</a>';
	}
	return $out . '<a class="btn btn-ghost btn-s" style="margin-top:12px;color:#16141F" href="' . esc_url( sib_whatsapp_url() ) . '" rel="noopener">' . esc_html__( 'Chat with us', 'shopinbos' ) . '</a></nav></aside>';
}

function sib_render_help_vote(): string {
	if ( ! is_singular() ) {
		return '';
	}
	// Canvas: "Did this answer your question?"
	return '<div class="card" style="padding:20px 22px;display:flex;gap:12px;align-items:center;flex-wrap:wrap" data-vote="' . (int) get_the_ID() . '" data-endpoint="' . esc_url( admin_url( 'admin-post.php?action=sib_help_vote' ) ) . '" data-thanks="' . esc_attr__( 'Thanks for telling us.', 'shopinbos' ) . '">'
		. '<b style="flex:1 1 0%;min-width:200px">' . esc_html__( 'Did this answer your question?', 'shopinbos' ) . '</b>'
		. '<button type="button" class="btn btn-ghost btn-s" data-helpful="1">' . esc_html__( 'Yes', 'shopinbos' ) . '</button>'
		. '<button type="button" class="btn btn-ghost btn-s" data-helpful="0">' . esc_html__( 'No, I need help', 'shopinbos' ) . '</button>'
		. '<a class="btn btn-acc btn-s helpful-chat" hidden href="' . esc_url( sib_whatsapp_url( 'Hi Shopinbos, I need help with: ' . get_the_title() ) ) . '" rel="noopener">' . esc_html__( 'Chat with us on WhatsApp', 'shopinbos' ) . '</a></div>';
}

/** Help article top bar (canvas): breadcrumb and a search box. */
function sib_render_help_top(): string {
	$term = null;
	if ( is_singular( 'sib_help' ) ) {
		$terms = wp_get_object_terms( get_the_ID(), 'sib_help_category' );
		$term  = $terms && ! is_wp_error( $terms ) ? $terms[0] : null;
	} elseif ( is_tax( 'sib_help_category' ) ) {
		$term = get_queried_object();
	}
	$crumb = '<a class="cv-b" href="' . esc_url( home_url( '/help/' ) ) . '" style="color:#6B6779;font-weight:600;font-size:13.5px">' . esc_html__( 'Help centre', 'shopinbos' ) . '</a>';
	if ( $term ) {
		$crumb .= '<span>/</span>' . ( is_singular() ? '<a href="' . esc_url( get_term_link( $term ) ) . '" style="color:#6B6779;font-weight:600;text-decoration:none">' . esc_html( $term->name ) . '</a>' : '<span>' . esc_html( $term->name ) . '</span>' );
	}
	return '<section class="cv" style="padding:28px 0 0;background:#F6F5F9"><div class="wrap" style="display:flex;flex-direction:column;gap:18px;padding-bottom:20px">'
		. '<nav class="crumb" aria-label="' . esc_attr__( 'Breadcrumb', 'shopinbos' ) . '">' . $crumb . '</nav>'
		. '<form role="search" action="' . esc_url( home_url( '/' ) ) . '" method="get" style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #ECEAF2;border-radius:999px;padding:0 18px;min-height:48px;max-width:520px">'
		. sib_icon( 'search', 18, '#6B6779' )
		. '<input type="search" name="s" aria-label="' . esc_attr__( 'Search help', 'shopinbos' ) . '" placeholder="' . esc_attr__( 'Search help articles', 'shopinbos' ) . '" style="border:0;outline:0;flex:1 1 0%;font-size:15px;background:none;min-width:0">'
		. '<input type="hidden" name="post_type" value="sib_help"></form></div></section>';
}

/** Help sidebar (canvas): the topic's articles. */
function sib_render_help_topic_nav(): string {
	$terms = is_singular( 'sib_help' ) ? wp_get_object_terms( get_the_ID(), 'sib_help_category' ) : [];
	$term  = $terms && ! is_wp_error( $terms ) ? $terms[0] : null;
	if ( ! $term ) {
		return sib_render_help_nav();
	}
	$colors = [ 'getting-started' => [ '#FFEDE4', '#B23E0A' ], 'orders' => [ '#E2F6F1', '#0C4A44' ], 'payments-and-payouts' => [ '#FDF0D5', '#8A5A08' ], 'delivery-and-pay-on-delivery' => [ '#E3EEFD', '#1F5FBF' ],
		'store-and-design' => [ '#E7E1FF', '#5B3FD6' ], 'whatsapp-and-social' => [ '#E2F5EA', '#16794A' ], 'sourcing-and-dropshipping' => [ '#FCE4EC', '#A0204F' ], 'account-and-security' => [ '#F6F5F9', '#16141F' ] ];
	[ $bg, $fg ] = $colors[ $term->slug ] ?? [ '#F6F5F9', '#16141F' ];
	$posts = get_posts( [ 'post_type' => 'sib_help', 'numberposts' => 12, 'tax_query' => [ [ 'taxonomy' => 'sib_help_category', 'terms' => $term->term_id ] ], 'orderby' => 'menu_order title', 'order' => 'ASC' ] );
	$out   = '<nav aria-label="' . esc_attr__( 'In this topic', 'shopinbos' ) . '" class="lgl-toc sticky" style="display:flex;flex-direction:column;gap:4px;background:#F6F5F9;border-radius:22px;padding:14px">'
		. '<a class="tag" href="' . esc_url( get_term_link( $term ) ) . '" style="background:' . $bg . ';color:' . $fg . ';align-self:flex-start;margin:4px 6px 8px;text-decoration:none">' . esc_html( $term->name ) . '</a>';
	foreach ( $posts as $p ) {
		$on   = get_the_ID() === $p->ID;
		$out .= '<a href="' . esc_url( get_permalink( $p ) ) . '"' . ( $on ? ' aria-current="page"' : '' ) . ' style="background:' . ( $on ? '#FFFFFF' : 'transparent' ) . ';border-radius:12px;padding:10px 12px;font-size:14px;font-weight:' . ( $on ? '800' : '600' ) . ';color:#16141F;text-decoration:none">' . esc_html( get_the_title( $p ) ) . '</a>';
	}
	return $out . '</nav>';
}

/** Help article title and meta line (canvas). */
function sib_render_help_head(): string {
	if ( ! is_singular() ) {
		return '';
	}
	$words = str_word_count( wp_strip_all_tags( function_exists( 'sib_post_plain_text' ) ? sib_post_plain_text( get_post() ) : get_the_content() ) );
	$mins  = max( 1, (int) round( $words / 200 ) );
	$meta  = sprintf( __( 'Updated %1$s ago · %2$d min read', 'shopinbos' ), human_time_diff( get_post_modified_time( 'U', true ) ), $mins );
	return '<div style="display:flex;flex-direction:column;gap:10px"><h1 class="disp" style="font-size:44px;line-height:1.08;margin:0">' . esc_html( get_the_title() ) . '</h1><span class="meta">' . esc_html( $meta ) . '</span></div>';
}

add_action( 'admin_post_nopriv_sib_help_vote', 'sib_help_vote' );
add_action( 'admin_post_sib_help_vote', 'sib_help_vote' );
function sib_help_vote(): void {
	$post = absint( $_POST['post'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification -- anonymous counter, rate limited
	if ( in_array( get_post_type( $post ), [ 'sib_help', 'post', 'sib_lesson' ], true ) && sib_rate_limit( 'vote' . $post, 1, DAY_IN_SECONDS ) ) {
		$key = ! empty( $_POST['helpful'] ) ? 'sib_votes_yes' : 'sib_votes_no'; // phpcs:ignore
		update_post_meta( $post, $key, (int) get_post_meta( $post, $key, true ) + 1 );
	}
	wp_send_json( [ 'ok' => true ] );
}

/* Votes column in the admin list so the support lead can spot weak articles. */
foreach ( [ 'sib_help', 'post', 'sib_lesson' ] as $sib_pt ) {
	add_filter( "manage_{$sib_pt}_posts_columns", fn( $c ) => $c + [ 'sib_votes' => __( 'Helpful', 'shopinbos' ) ] );
	add_action( "manage_{$sib_pt}_posts_custom_column", 'sib_votes_column', 10, 2 );
}
unset( $sib_pt );
function sib_votes_column( $col, $id ) {
	if ( 'sib_votes' === $col ) {
		$y = (int) get_post_meta( $id, 'sib_votes_yes', true );
		$n = (int) get_post_meta( $id, 'sib_votes_no', true );
		echo esc_html( $y + $n ? sprintf( '%d%% of %d', round( $y / ( $y + $n ) * 100 ), $y + $n ) : '–' );
	}
}

/* The app links to help articles by slug. Warn editors before they change one. */
add_action( 'admin_notices', function () {
	$screen = get_current_screen();
	if ( $screen && 'sib_help' === $screen->post_type && 'post' === $screen->base ) {
		echo '<div class="notice notice-info"><p>' . esc_html__( 'The app links to help articles by their slug. If you change a slug, add a redirect from the old URL.', 'shopinbos' ) . '</p></div>';
	}
} );

/* Search: allow post_type[] from our forms, keep campaign pages out. */
add_action( 'pre_get_posts', function ( WP_Query $q ) {
	if ( is_admin() || ! $q->is_main_query() || ! $q->is_search() ) {
		return;
	}
	$allowed = [ 'post', 'page', 'sib_help', 'sib_resource', 'sib_feature', 'sib_solution', 'sib_industry', 'sib_tool', 'sib_integration', 'sib_city', 'sib_comparison', 'sib_template' ];
	$types   = array_intersect( (array) $q->get( 'post_type' ), $allowed );
	$q->set( 'post_type', $types ?: $allowed );
	$q->set( 'posts_per_page', 20 );
} );
