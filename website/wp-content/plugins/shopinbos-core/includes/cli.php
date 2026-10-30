<?php
/**
 * WP-CLI commands.
 *
 *   wp shopinbos setup [--samples]   Permalinks, core pages built from the theme patterns, help and blog
 *                                    categories, store templates and tools. Safe to run again: it only
 *                                    creates what is missing. --samples adds one example of each content type.
 *   wp shopinbos sitemap             Rebuild the marketplace sitemap now.
 *   wp shopinbos flush               Clear cached marketplace API answers.
 */

defined( 'ABSPATH' ) || exit;

class Sib_CLI {

	/**
	 * Set up a fresh site.
	 *
	 * [--samples]
	 * : Also create one sample feature, help article, guide and integration.
	 *
	 * @param array $args
	 * @param array $assoc
	 */
	public function setup( $args, $assoc ) {
		update_option( 'blogname', 'Shopinbos' );
		update_option( 'blogdescription', 'Sell online and reach your customers. Find products, sell everywhere, run your store, talk to customers and get paid, in one app.' );
		update_option( 'timezone_string', 'Africa/Lagos' );
		update_option( 'date_format', 'j F Y' );
		update_option( 'default_comment_status', 'closed' );
		update_option( 'default_ping_status', 'closed' );
		update_option( 'category_base', 'blog/category' );
		update_option( 'tag_base', 'blog/tag' );
		global $wp_rewrite;
		$wp_rewrite->set_permalink_structure( '/blog/%postname%/' );

		$home  = $this->refresh_page( 'home', 'Home', $this->pattern( 'shopinbos/page-home' ), 'page-canvas' );
		$blog  = $this->page( 'blog', 'Blog', '' );
		$this->refresh_page( 'for-suppliers', 'For suppliers', $this->pattern( 'shopinbos/page-for-suppliers' ), 'page-canvas', 'Sell your products through hundreds of Nigerian online shops. List once, ship with their label, get paid after delivery.' );
		$this->refresh_page( 'delivery', 'For delivery companies and riders', $this->pattern( 'shopinbos/page-delivery' ), 'page-canvas', 'Get delivery jobs from Shopinbos shops every day. Use the Partners app or connect your system. Cash on delivery confirmed with a code.' );
		$cs = $this->refresh_page( 'waitlist', 'Join the waitlist', "<!-- wp:shopinbos/coming-soon /-->\n\n<!-- wp:shopinbos/gist-rail /-->\n", 'page-canvas', 'Join the Shopinbos waitlist before we open on November 1. For sellers, suppliers and delivery partners in Nigeria. Free, with setup help.' );
		// The old Coming soon page is now /waitlist/ (redirects.php sends its address there).
		if ( ( $old_cs = get_page_by_path( 'coming-soon' ) ) && 'publish' === $old_cs->post_status ) {
			wp_update_post( [ 'ID' => $old_cs->ID, 'post_status' => 'draft' ] );
		}
		// The site is never hidden any more: the old "show only Coming soon" switch is gone.
		$opts = (array) get_option( 'sib_settings', [] );
		if ( isset( $opts['site_coming_soon'] ) ) {
			unset( $opts['site_coming_soon'] );
			update_option( 'sib_settings', $opts );
		}
		delete_post_meta( $cs, 'sib_noindex' );
		if ( $made = sib_gist_import() ) {
			WP_CLI::log( "Added {$made} Gist stories (edit them under Website > Gist stories)" );
		}
		$this->refresh_page( 'gist', 'Gist: selling tips in 60 seconds', sib_block_html( '<section class="ahero cv" style="padding:56px 0 8px;background:linear-gradient(#FFF6F1 0%,#fff 100%)"><div class="wrap" style="display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center;max-width:760px"><span class="gist-badge"><span class="gist-dot"></span>Gist</span><h1 class="disp h1" style="font-size:58px">Selling tips in <span class="grad">60 seconds</span></h1><p class="lead">No long articles. Tap a circle and watch quick, animated tips on pricing, WhatsApp, delivery, photos and getting your first orders. New Gist every week.</p></div></section>' ) . "<!-- wp:shopinbos/gist-rail {\"layout\":\"grid\",\"heading\":false} /-->\n\n<!-- wp:shortcode -->\n[sib_gist_text]\n<!-- /wp:shortcode -->\n", 'page-canvas', 'Quick, animated selling tips for Nigerian online sellers: pricing, WhatsApp Status, delivery, photos and your first orders, in 60 seconds.' );
		if ( $made = sib_trend_import() ) {
			WP_CLI::log( "Scheduled {$made} trend reports" );
		}
		$this->refresh_page( 'trending', 'Trending TikTok products to sell in Nigeria', "<!-- wp:shopinbos/trend-feed /-->\n\n<!-- wp:shopinbos/canvas {\"part\":\"trending-05\"} /-->\n\n<!-- wp:shopinbos/canvas {\"part\":\"trending-06\"} /-->\n", 'page-canvas', 'Products trending on TikTok that Nigerian sellers can stock, updated every morning, with naira prices, where to get stock, video ideas and suppliers on Shopinbos.' );
		$this->refresh_page( 'pricing', 'Pricing', "<!-- wp:shopinbos/pricing /-->\n\n<!-- wp:shopinbos/canvas {\"part\":\"pricing-03\"} /-->\n", 'page-canvas', 'Shopinbos plans in naira for sellers, suppliers and delivery partners. Start free; payments go straight to your bank. Every plan has your store, Rex and riders; pay on delivery on Growth and Pro.' );
		$this->refresh_page( 'about', 'About Shopinbos', $this->pattern( 'shopinbos/page-about' ), 'page-canvas', 'We make it easy to sell online and reach your customers: find products, sell everywhere, run your store, talk to customers and get paid.' );
		$this->refresh_page( 'investors', 'Investor relations', "<!-- wp:shopinbos/investors-page /-->\n", 'page-canvas', 'Shopinbos is building the commerce operating system for African businesses. Company facts, business model and investor enquiries.' );
		$this->refresh_page( 'contact', 'Contact us', "<!-- wp:shopinbos/contact-page /-->\n", 'page-canvas', 'Talk to a real person at Shopinbos on WhatsApp, by email or with the form. 8am to 8pm, in English or Pidgin.' );
		$old_contact = get_page_by_path( 'contact' );
		if ( $old_contact && str_contains( $old_contact->post_content, 'The fastest way to reach us is WhatsApp. A real person replies' ) && str_contains( $old_contact->post_content, 'shopinbos/lead-form' ) ) {
			wp_update_post( wp_slash( [ 'ID' => $old_contact->ID, 'post_content' => "<!-- wp:shopinbos/contact-page /-->\n" ] ) );
			update_post_meta( $old_contact->ID, '_wp_page_template', 'page-canvas' );
		}
		$this->refresh_page( 'careers', 'Careers', $this->careers_text(), 'page-article', 'Work on the app that helps Nigerian sellers run their shops from a phone.' );
		$this->refresh_page( 'press', 'Press', $this->press_text(), 'page-article', 'Facts, logos and contacts for journalists writing about Shopinbos.' );
		$this->academy_curriculum();
		$this->academy();
		$thanks = $this->page( 'thanks', 'You’re in', $this->text_page( 'Thanks for confirming. Your first tip is on its way.' ), 'page-article' );
		update_post_meta( $thanks, 'sib_noindex', true );
		$privacy = $this->legal();

		if ( ( $wp_privacy = (int) get_option( 'wp_page_for_privacy_policy' ) ) && $wp_privacy !== $privacy && 'draft' === get_post_status( $wp_privacy ) ) {
			wp_delete_post( $wp_privacy, true );
		}
		update_option( 'wp_page_for_privacy_policy', $privacy );
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $home );
		update_option( 'page_for_posts', $blog );

		$this->old_pages();
		$this->comparisons();
		$this->blog();
		$this->articles();
		$this->resources();
		// Make "Selling on WhatsApp" the default category and drop WordPress's sample content.
		$start = get_term_by( 'slug', 'selling-on-whatsapp', 'category' );
		if ( $start ) {
			update_option( 'default_category', $start->term_id );
		}
		if ( ( $uncat = get_term_by( 'slug', 'uncategorized', 'category' ) ) && $start ) {
			wp_delete_term( $uncat->term_id, 'category', [ 'default' => $start->term_id, 'force_default' => true ] );
		}
		foreach ( [ [ 'hello-world', 'post' ], [ 'sample-page', 'page' ] ] as [ $slug, $type ] ) {
			if ( $old = get_page_by_path( $slug, OBJECT, $type ) ) {
				wp_delete_post( $old->ID, true );
			}
		}
		$this->terms( 'sib_help_category', [
			'Getting started', 'Store and design', 'Products', 'Orders', 'Payments and payouts', 'Delivery and pay on delivery',
			'Chats and Peggy', 'Marketing and ads', 'Sourcing and dropshipping', 'Account and security',
			[ 'Suppliers: getting started', 'supplier-getting-started' ], [ 'Delivery partners: getting started', 'delivery-partner-getting-started' ],
		] );

		$this->help();
		$this->blog_q4();
		$this->store_templates();
		$this->tools();
		$this->integration_pages();
		// Waitlist landing page for ads: /join/ → /lp/join/.
		$join = get_page_by_path( 'join', OBJECT, 'sib_landing' );
		if ( $join ) {
			$this->refresh_post( $join, 'Join the Shopinbos waitlist', "<!-- wp:shopinbos/join /-->\n", 'Get in first when Shopinbos opens on 1 November. Sellers, suppliers and delivery partners: join the waitlist in a minute.' );
		} else {
			$id = wp_insert_post( [ 'post_type' => 'sib_landing', 'post_status' => 'publish', 'post_name' => 'join', 'post_title' => 'Join the Shopinbos waitlist', 'post_content' => "<!-- wp:shopinbos/join /-->\n", 'post_excerpt' => 'Get in first when Shopinbos opens on 1 November. Sellers, suppliers and delivery partners: join the waitlist in a minute.' ] );
			if ( $id && ! is_wp_error( $id ) ) {
				update_post_meta( $id, '_sib_seed_src', md5( "<!-- wp:shopinbos/join /-->\n" ) );
				$this->fingerprint( $id );
				WP_CLI::log( 'Created the waitlist landing page /lp/join/ (short link /join/)' );
			}
		}
		if ( ! get_posts( [ 'post_type' => 'sib_showcase', 'post_status' => 'any', 'numberposts' => 1, 'fields' => 'ids' ] ) ) {
			$r  = sib_showcase_rexi();
			$id = wp_insert_post( [ 'post_type' => 'sib_showcase', 'post_status' => 'publish', 'post_title' => $r['name'], 'post_excerpt' => $r['about'] ] );
			foreach ( [ 'url', 'sells', 'template', 'desktop', 'mobile' ] as $k ) {
				update_post_meta( $id, 'sib_showcase_' . $k, $r[ $k ] );
			}
			WP_CLI::log( 'Added Rexi to the store showcase (Website > Store showcase)' );
		}
		if ( ! empty( $assoc['samples'] ) ) {
			$this->samples();
		}

		create_initial_taxonomies(); // picks up the new category and tag bases
		sib_register_content_types();
		sib_marketplace_rewrite_rules();
		flush_rewrite_rules();
		sib_build_sitemap();
		$this->text_fixes(); // before the search fields, which are built from the (now fixed) excerpts
		$this->seo_meta();
		[ $webp, $alts ] = sib_media_optimise();
		WP_CLI::log( "Images: {$webp} WebP copies made, {$alts} alt texts filled in" );
		WP_CLI::success( 'Shopinbos is set up. Front page: ' . get_permalink( $home ) );
	}

	/**
	 * Print the link that shows the new website (V9) in your browser before launch. ?v9=off turns it off again.
	 *
	 * @subcommand v9-link
	 */
	public function v9_link() {
		if ( ! function_exists( 'sib_v9_key' ) ) {
			WP_CLI::error( 'The Shopinbos theme with V9 is not active.' );
		}
		WP_CLI::log( 'Preview on:  ' . add_query_arg( 'v9', sib_v9_key(), home_url( '/' ) ) );
		WP_CLI::log( 'Preview off: ' . add_query_arg( 'v9', 'off', home_url( '/' ) ) );
		WP_CLI::log( sib_v9_launched() ? 'V9 is live for everyone.' : 'V9 goes live for everyone on ' . wp_date( 'j F Y, H:i T', function_exists( 'sib_launch_ts' ) ? sib_launch_ts() : time() ) . '.' );
	}

	/**
	 * List the [placeholders] still showing on the new website, and the pages they are on.
	 *
	 * @subcommand v9-placeholders
	 */
	public function v9_placeholders() {
		if ( ! function_exists( 'sib_v9_open_placeholders' ) ) {
			WP_CLI::error( 'The Shopinbos theme with V9 is not active.' );
		}
		$open = sib_v9_open_placeholders();
		foreach ( $open as $p => $pages ) {
			WP_CLI::log( str_pad( $p, 48 ) . implode( ', ', array_unique( $pages ) ) );
		}
		WP_CLI::log( count( $open ) . ' open. Fill them in Settings → Shopinbos → Website text to fill in.' );
	}

	/** Rebuild the marketplace sitemap now. */
	public function sitemap() {
		sib_build_sitemap() ? WP_CLI::success( 'Marketplace sitemap rebuilt.' ) : WP_CLI::error( 'The API did not answer; kept the previous sitemap.' );
	}

	/** Clear cached marketplace API answers. */
	public function flush() {
		sib_api_flush_cache();
		WP_CLI::success( 'Marketplace cache cleared.' );
	}

	/** Long-form posts written to rank (seed/blog-q4.json, from content/blog-q4 via tools/md_posts.py). Future dates are scheduled. */
	private function blog_q4(): void {
		$file = SIB_CORE_DIR . '/includes/seed/blog-q4.json';
		if ( ! file_exists( $file ) ) {
			return;
		}
		foreach ( (array) json_decode( (string) file_get_contents( $file ), true ) as $b ) {
			if ( get_page_by_path( $b['slug'], OBJECT, 'post' ) ) {
				continue;
			}
			$date = $b['date'] . ( strlen( $b['date'] ) === 16 ? ':00' : '' );
			$id   = wp_insert_post( wp_slash( [
				'post_type'     => 'post',
				'post_status'   => strtotime( $date ) > current_time( 'timestamp' ) ? 'future' : 'publish',
				'post_name'     => $b['slug'],
				'post_title'    => $b['title'],
				'post_excerpt'  => $b['dek'],
				'post_content'  => $b['content'],
				'post_date'     => $date,
				'post_date_gmt' => get_gmt_from_date( $date ),
				'post_author'   => $this->team_author(),
			] ) );
			if ( ! $id || is_wp_error( $id ) ) {
				WP_CLI::warning( "Could not create post {$b['slug']}" );
				continue;
			}
			wp_set_object_terms( $id, [ $b['category'] ], 'category' );
			update_post_meta( $id, 'sib_cover_bg', $b['cover_bg'] ?? '#FFEDE4' );
			update_post_meta( $id, 'sib_cover_fit', str_starts_with( $b['cover'], 'person-' ) ? 'contain' : 'cover' );
			if ( $att = $this->media( $b['cover'] ) ) {
				set_post_thumbnail( $id, $att );
			} else {
				update_post_meta( $id, 'sib_cover', $b['cover'] );
			}
			foreach ( [ 'rank_math_title' => $b['meta_title'], 'rank_math_description' => $b['meta_description'], 'rank_math_focus_keyword' => $b['keyword'],
				'_yoast_wpseo_title' => $b['meta_title'], '_yoast_wpseo_metadesc' => $b['meta_description'], '_yoast_wpseo_focuskw' => $b['keyword'] ] as $k => $v ) {
				if ( $v ) {
					update_post_meta( $id, $k, $v );
				}
			}
			WP_CLI::log( 'Created post ' . $b['slug'] . ( strtotime( $date ) > current_time( 'timestamp' ) ? ' (scheduled ' . $b['date'] . ')' : '' ) );
		}
	}

	/** Help centre topics (named as on the help centre home) and the popular articles. */
	private function help(): void {
		require_once SIB_CORE_DIR . '/includes/seed/blog.php';
		require_once SIB_CORE_DIR . '/includes/seed/help.php';
		foreach ( sib_seed_help_topics() as $i => [ $name, $slug, $about ] ) {
			$term = term_exists( $slug, 'sib_help_category' );
			if ( $term ) {
				wp_update_term( (int) $term['term_id'], 'sib_help_category', [ 'name' => $name, 'description' => $about ] );
			} else {
				$term = wp_insert_term( $name, 'sib_help_category', [ 'slug' => $slug, 'description' => $about ] );
			}
			if ( ! is_wp_error( $term ) ) {
				update_term_meta( (int) $term['term_id'], 'sib_order', $i + 1 );
			}
		}
		foreach ( sib_seed_help_articles() as $i => [ $slug, $title, $topic, $summary, $content ] ) {
			$existing = get_page_by_path( $slug, OBJECT, 'sib_help' );
			if ( $existing && 'sib_help' === $existing->post_type ) {
				$this->refresh_post( $existing, $title, $content, $summary, '', $i + 1 );
				continue;
			}
			$id = $this->cpt( 'sib_help', $slug, $title, $content, $summary, [ 'sib_reviewed' => gmdate( 'Y-m-d' ), 'sib_popular' => 1 ], '', $i + 1, [ 'sib_help_category' => [ $topic ] ] );
			update_post_meta( $id, '_sib_seed_src', md5( $content ) );
			$this->fingerprint( $id );
		}
	}

	/* ---------- helpers ---------- */

	private function page( string $slug, string $title, string $content, string $template = '', string $excerpt = '', int $parent = 0 ): int {
		$existing = get_page_by_path( $parent ? get_post_field( 'post_name', $parent ) . '/' . $slug : $slug );
		if ( $existing ) {
			return $existing->ID;
		}
		$id = wp_insert_post( wp_slash( [ 'post_type' => 'page', 'post_status' => 'publish', 'post_name' => $slug, 'post_title' => $title, 'post_content' => $content, 'post_excerpt' => $excerpt, 'post_parent' => $parent ] ), true );
		if ( is_wp_error( $id ) ) {
			WP_CLI::error( $id->get_error_message() );
		}
		if ( $template ) {
			update_post_meta( $id, '_wp_page_template', $template );
		}
		WP_CLI::log( "Created page /{$slug}/" );
		return $id;
	}

	/**
	 * Create a page, or replace one that nobody has written in yet: empty (pages left by the old theme, whose
	 * content lived in PHP files), first-install placeholder text, or content this command wrote and nobody has
	 * edited since. Pages someone has edited are left alone.
	 */
	private function refresh_page( string $slug, string $title, string $content, string $template, string $excerpt = '', int $parent = 0, int $order = 0 ): int {
		$existing = get_page_by_path( $parent ? get_page_uri( $parent ) . '/' . $slug : $slug );
		if ( ! $existing || 'page' !== $existing->post_type ) {
			$id = $this->page( $slug, $title, $content, $template, $excerpt, $parent );
			wp_update_post( [ 'ID' => $id, 'menu_order' => $order ] );
			$this->fingerprint( $id );
			return $id;
		}
		return $this->refresh_post( $existing, $title, $content, $excerpt, $template, $order );
	}

	/** Replace a post's content when it is safe to (see refresh_page). Returns the post ID. */
	private function refresh_post( WP_Post $post, string $title, string $content, string $excerpt, string $template = '', int $order = 0 ): int {
		if ( '' === trim( $content ) || ! $this->replaceable( $post ) ) {
			return $post->ID;
		}
		if ( md5( $content ) === get_post_meta( $post->ID, '_sib_seed_src', true ) ) {
			return $post->ID; // already up to date
		}
		wp_update_post( wp_slash( [ 'ID' => $post->ID, 'post_title' => $title, 'post_content' => $content, 'post_excerpt' => $excerpt, 'menu_order' => $order ?: $post->menu_order, 'post_status' => 'publish' ] ) );
		if ( $template ) {
			update_post_meta( $post->ID, '_wp_page_template', $template );
		}
		update_post_meta( $post->ID, '_sib_seed_src', md5( $content ) );
		$this->fingerprint( $post->ID );
		WP_CLI::log( 'Updated ' . $post->post_type . ' ' . get_page_uri( $post ) );
		return $post->ID;
	}

	private function replaceable( WP_Post $post ): bool {
		$text = trim( wp_strip_all_tags( strip_shortcodes( $post->post_content ) ) );
		if ( '' === $text && ! has_blocks( $post->post_content ) ) {
			return true; // empty: left by the old theme
		}
		if ( preg_match( '/\[(Legal to supply|Write the company|List open roles|Press kit)|^\s*<!-- wp:paragraph -->\s*<p>Our policies\.<\/p>|is coming soon/', $post->post_content ) ) {
			return true;
		}
		$print = get_post_meta( $post->ID, '_sib_seed_hash', true );
		if ( $print ) {
			return md5( $post->post_content ) === $print; // written by this command and not edited since
		}
		return $post->post_modified_gmt === $post->post_date_gmt && (int) $post->post_author === (int) get_current_user_id(); // created by an older version of this command
	}

	/** Remember what this command wrote, so a later run knows whether a person has edited it. */
	private function fingerprint( int $id ): void {
		update_post_meta( $id, '_sib_seed_hash', md5( (string) get_post_field( 'post_content', $id, 'raw' ) ) );
	}

	/**
	 * Search title, description and focus keyword for every page and post (seo-map.php), written into Yoast's and
	 * Rank Math's fields so the team sees and edits them there. Fields a person has changed are left alone:
	 * we only fill empty ones, or ones still holding what setup wrote last time.
	 */
	/**
	 * Correct facts that changed (prices, the mybos.store address) in content already on the site, such as blog
	 * posts that setup only creates once. Only these exact phrases change, so edits people made are kept.
	 */
	private function text_fixes(): void {
		global $wpdb;
		$fixes = (array) json_decode( (string) file_get_contents( SIB_CORE_DIR . '/includes/seed/text-fixes.json' ), true );
		$fixes[] = [ '#\\b(yourname|adaezestudio|pluggadgets|mamateepantry|kemibeautyhub|funmicrowns|adaeze)\\.shopinbos\\.com#', '$1.mybos.store', true ];
		$done  = 0;
		$ids   = $wpdb->get_col( "SELECT ID FROM {$wpdb->posts} WHERE post_status IN ('publish','future','draft') AND post_type NOT IN ('revision','attachment','nav_menu_item') AND (post_content LIKE '%shopinbos.com%' OR post_content LIKE '%₦7,500%' OR post_content LIKE '%50 products%' OR post_content LIKE '%Starter plan%' OR post_content LIKE '%every Friday%' OR post_content LIKE '%pay on delivery built in%' OR post_content LIKE '%pay on delivery and rider booking%' OR post_content LIKE '%commission (2%' OR post_content LIKE '%Friday%' OR post_content LIKE '%ithdraw%' OR post_content LIKE '%next working day%' OR post_content LIKE '%your balance%' OR post_content LIKE '%payout day%' OR post_content LIKE '%nstant%' OR post_content LIKE '%as soon as%' OR post_content LIKE '%straight away%' OR post_excerpt LIKE '%Friday%' OR post_excerpt LIKE '%ithdraw%' OR post_excerpt LIKE '%Shopinbos balance%' OR post_excerpt LIKE '%nstant%' OR post_excerpt LIKE '%s soon as%')" ); // phpcs:ignore
		$fix  = function ( string $text ) use ( $fixes ): string {
			foreach ( $fixes as $f ) {
				$text = ! empty( $f[2] ) ? preg_replace( $f[0], $f[1], $text ) : str_replace( $f[0], $f[1], $text );
			}
			return $text;
		};
		foreach ( $ids as $id ) {
			$post    = get_post( (int) $id );
			$new     = $fix( $post->post_content );
			$excerpt = $fix( $post->post_excerpt );
			if ( $new !== $post->post_content || $excerpt !== $post->post_excerpt ) {
				$was_seed = $this->replaceable( $post );
				$wpdb->update( $wpdb->posts, [ 'post_content' => $new, 'post_excerpt' => $excerpt ], [ 'ID' => $post->ID ] );
				clean_post_cache( $post->ID );
				if ( $was_seed ) {
					$this->fingerprint( $post->ID );
				}
				$done++;
			}
		}
		// The plain (non-regex) fixes also apply to gist text, plus the payout number on the money gist.
		$plain = array_merge( [ [ 'a free shopinbos.com link', 'a free mybos.store link' ], [ '"number":"Every Friday"', '"number":"To your bank"' ], [ '"number":"Instant"', '"number":"To your bank"' ] ], array_values( array_filter( $fixes, fn( $f ) => empty( $f[2] ) ) ) );
		// Gist stories keep their text in meta.
		foreach ( get_posts( [ 'post_type' => 'sib_gist', 'post_status' => [ 'publish', 'future' ], 'numberposts' => -1 ] ) as $g ) {
			$meta = get_post_meta( $g->ID, 'sib_gist', true );
			$json = wp_json_encode( $meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
			$new  = preg_replace( '#\\b(yourname|[a-z]+)\\.shopinbos\\.com#', '$1.mybos.store', str_replace( array_column( $plain, 0 ), array_column( $plain, 1 ), (string) $json ) );
			$new  = str_replace( 'app.mybos.store', 'app.shopinbos.com', $new );
			if ( $new !== $json && is_array( json_decode( $new, true ) ) ) {
				update_post_meta( $g->ID, 'sib_gist', json_decode( $new, true ) );
				$done++;
			}
		}
		WP_CLI::log( "Text fixes (prices, store address, payouts): {$done} items updated" );
	}

	private function seo_meta(): void {
		$types = array_merge( [ 'page', 'post' ], array_keys( sib_content_types() ), [ 'sib_lesson' ] );
		$ids   = get_posts( [ 'post_type' => $types, 'post_status' => [ 'publish', 'future' ], 'numberposts' => -1, 'fields' => 'ids' ] );
		$done  = 0;
		foreach ( $ids as $id ) {
			$post = get_post( $id );
			if ( get_post_meta( $id, 'sib_noindex', true ) ) {
				continue;
			}
			[ $title, $desc, $kw ] = sib_seo_auto( $post ) + [ '', '', '' ];
			$prev = (array) get_post_meta( $id, '_sib_seo_auto', true );
			$set  = [
				'_yoast_wpseo_title'      => $title,
				'_yoast_wpseo_metadesc'   => $desc,
				'_yoast_wpseo_focuskw'    => $kw,
				'rank_math_title'         => $title,
				'rank_math_description'   => $desc,
				'rank_math_focus_keyword' => $kw,
			];
			$changed = false;
			foreach ( $set as $key => $value ) {
				$current = (string) get_post_meta( $id, $key, true );
				if ( '' === $value || $current === $value ) {
					continue;
				}
				if ( '' === $current || ( $prev[ $key ] ?? null ) === $current ) {
					update_post_meta( $id, $key, $value );
					$changed = true;
				}
			}
			if ( $changed ) {
				update_post_meta( $id, '_sib_seo_auto', $set );
				$done++;
			}
		}
		WP_CLI::log( "Search titles and descriptions filled in for {$done} pages" );
	}

	/** Two published pages at one URL (the old site has a few): keep the oldest. */
	private function dedupe_pages(): void {
		foreach ( [ 'legal/cookies', 'legal/privacy', 'legal/terms', 'legal/acceptable-use', 'partners/agencies' ] as $path ) {
			$dupes = $this->pages_at( $path );
			foreach ( array_slice( $dupes, 1 ) as $old ) {
				if ( $this->replaceable( $old ) ) {
					wp_trash_post( $old->ID );
					WP_CLI::log( "Removed duplicate page /{$path}/ (#{$old->ID})" );
				}
			}
		}
	}

	/** /legal/ and its documents. Returns the privacy policy page ID. */
	private function legal(): int {
		require_once SIB_CORE_DIR . '/includes/seed/blog.php';
		require_once SIB_CORE_DIR . '/includes/seed/legal.php';
		$hub     = sib_block_p( 'The agreements and policies for everyone who uses Shopinbos: sellers, their customers, suppliers and delivery partners. Each one starts with a summary in plain words.' ) . sib_seed_b( 'legal-index' );
		$this->dedupe_pages();
		$legal   = $this->refresh_page( 'legal', 'Legal', $hub, 'page-article' );
		$privacy = 0;
		foreach ( sib_seed_legal_docs() as $i => [ $slug, $title, $lead, $summary, $sections, $email ] ) {
			$markup = sib_seed_legal_markup( $summary, $sections );
			$before = get_page_by_path( 'legal/' . $slug );
			$old    = $before ? (string) get_post_meta( $before->ID, '_sib_seed_src', true ) : '';
			$id     = $this->refresh_page( $slug, $title, $markup, 'page-legal', $lead, $legal, $i + 1 );
			$now    = (string) get_post_meta( $id, '_sib_seed_src', true );
			if ( $before && $old && $old !== $now ) {
				// The approved wording changed: new "last updated" date, and 30 days' notice before it applies.
				$today = new DateTimeImmutable( 'today', wp_timezone() );
				update_post_meta( $id, 'sib_updated', $today->format( 'Y-m-d' ) );
				update_post_meta( $id, 'sib_effective', $today->modify( '+30 days' )->format( 'Y-m-d' ) );
				WP_CLI::log( "Legal: /legal/{$slug}/ updated, applies from " . $today->modify( '+30 days' )->format( 'j F Y' ) );
			} elseif ( $before && md5( $markup ) !== $now ) {
				WP_CLI::warning( "Legal: /legal/{$slug}/ was edited in WordPress, so it was not updated. Apply the new wording by hand, then set its dates." );
			}
			foreach ( [ 'sib_updated' => '2026-10-01', 'sib_effective' => '2026-11-01', 'sib_legal_email' => $email ] as $k => $v ) {
				if ( ! get_post_meta( $id, $k, true ) ) {
					update_post_meta( $id, $k, $v );
				}
			}
			if ( 'privacy' === $slug ) {
				$privacy = $id;
			}
		}
		return $privacy;
	}

	/** A registered pattern's markup with nested pattern blocks expanded, so writers can edit everything. */
	private function pattern( string $slug, int $depth = 0 ): string {
		$p = WP_Block_Patterns_Registry::get_instance()->get_registered( $slug );
		if ( ! $p && function_exists( '_register_theme_block_patterns' ) ) {
			// WordPress caches the theme's pattern list; a newly deployed pattern needs a fresh read.
			wp_get_theme()->delete_pattern_cache();
			_register_theme_block_patterns();
			$p = WP_Block_Patterns_Registry::get_instance()->get_registered( $slug );
		}
		if ( ! $p ) {
			WP_CLI::warning( "Pattern {$slug} is not registered. Is the Shopinbos theme active?" );
			return '';
		}
		$content = $p['content'];
		if ( $depth < 3 ) {
			$content = preg_replace_callback( '#<!-- wp:pattern \{"slug":"([^"]+)"\} /-->#', fn( $m ) => $this->pattern( $m[1], $depth + 1 ), $content );
		}
		return $content;
	}

	/** Integration pages with a real hero (H1), what it does, setup steps and questions. Only replaces the first
	 *  one-line version or a version this command wrote and nobody has edited. */
	private function integration_pages(): void {
		$pages = [
			'paystack' => [ 'Paystack', 'Paystack + Shopinbos: card, transfer and USSD payments', 'Card, bank transfer and USSD payments at checkout and on payment links. Built in, with nothing to set up, and your money is paid out to your bank account.', 'Card, bank transfer and USSD at checkout',
				[ 'Customers pay by card (Visa, Mastercard, Verve), bank transfer or USSD at your store checkout.', 'Send a Paystack payment link in WhatsApp or Instagram DMs and Peggy confirms the payment for you.', 'The fee is 1.5% + ₦100 per payment, capped at ₦2,000. The ₦100 is waived on payments under ₦2,500.', 'Payments are paid out to your bank account through Paystack.' ],
				[ 'Open your store | Paystack is switched on for every Shopinbos store.', 'Add your bank account | Under Payouts, add the account your money should go to.', 'Share your store link | Customers choose card, transfer or USSD at checkout.' ],
				[ 'Do I need my own Paystack account? | No. Payments run through Shopinbos’s Paystack account and are paid out to your bank account.', 'How much does Paystack charge? | 1.5% + ₦100 per payment, capped at ₦2,000. On payments under ₦2,500 the ₦100 is waived.', 'Can customers still pay on delivery? | Yes. Pay on delivery works alongside Paystack for orders up to ₦50,000 in Lagos, Abuja, Ibadan and Port Harcourt.' ] ],
			'whatsapp' => [ 'WhatsApp Business', 'WhatsApp Business + Shopinbos: sell in chats', 'Sync your catalogue, answer every chat in one inbox, send payment links and order updates, and let Peggy reply to “how much?” while you rest.', 'Catalogue, chats, payment links and order updates',
				[ 'Your Shopinbos products show in your WhatsApp Business catalogue, with prices and photos kept in sync.', 'Chats from WhatsApp, Instagram and Facebook arrive in one Shopinbos inbox.', 'Send a payment link or an order link in the chat, and the order is created when the customer pays.', 'Customers get order, delivery and pay on delivery code updates on WhatsApp automatically.' ],
				[ 'Connect WhatsApp Business | In the app, go to Sales channels and connect your WhatsApp Business number.', 'Sync your catalogue | Choose the products to show in your WhatsApp catalogue.', 'Turn on Peggy | Let Peggy answer common questions and send pay links when you are busy.' ],
				[ 'Do I need the WhatsApp Business app? | Yes, use a WhatsApp Business number. It is free to download from the Play Store or App Store.', 'Will my customers know a bot is replying? | Peggy replies in your shop’s name and hands over to you whenever a customer asks for a person.', 'Can I send broadcasts? | Yes, to customers who saved your number or agreed to hear from you. Shopinbos keeps track of opt-outs.' ] ],
			'tiktok-shop' => [ 'TikTok Shop', 'TikTok + Shopinbos: sell in videos and lives', 'Turn TikTok views into orders: link products in your videos and lives, send buyers to your Shopinbos store and keep orders, stock and delivery in one app.', 'Sell in videos and lives',
				[ 'Add your Shopinbos store link to your TikTok bio and video captions.', 'Product links in your posts open straight to checkout with card, transfer or pay on delivery.', 'Orders from TikTok land in the same app as WhatsApp and Instagram, with stock kept in sync.', 'Peggy can write captions and hooks for your next video.' ],
				[ 'Add your store link | Put yourname.mybos.store in your TikTok bio.', 'Post product videos | Show the product in use and put the price in the caption.', 'Apply for TikTok Shop | Where TikTok Shop is available, apply from the Sales channels page in the app.' ],
				[ 'Is TikTok Shop available in Nigeria? | TikTok Shop is rolling out by country. Until it is open to you, sell with your Shopinbos store link in your bio and captions.', 'Do I need many followers? | No. Short, clear videos of the product in use can sell from your first posts.', 'Where do TikTok orders show? | In your Shopinbos orders, with the other channels, so you pack and deliver them the same way.' ] ],
		];
		foreach ( $pages as $slug => [ $name, $h1, $lead, $excerpt, $points, $steps, $faq ] ) {
			$post = get_page_by_path( $slug, OBJECT, 'sib_integration' );
			if ( ! $post ) {
				$this->cpt( 'sib_integration', $slug, $name, $this->text_page( $lead ), $excerpt, [ 'sib_integration_status' => 'tiktok-shop' === $slug ? 'apply' : 'live' ] );
				$post = get_page_by_path( $slug, OBJECT, 'sib_integration' );
				if ( ! $post ) {
					continue;
				}
			}
			$content = sib_block_group_open( 'land-hero', 'section' ) . sib_block_group_open( 'wrap col-22 mw-760', 'div', [ 'top' => '56px', 'bottom' => '40px' ] )
				. sib_block_p( 'Integration', 'eyebrow' ) . sib_block_h( 1, esc_html( $h1 ), 'disp h1 h1-58' ) . sib_block_p( esc_html( $lead ), 'lead' )
				. sib_block_buttons( [ [ 'Start your shop', '/go/signup?intent=integration_' . $slug, 'accent' ], [ 'See all features', '/features/', 'ghost' ] ] )
				. sib_block_group_close() . sib_block_group_close( 'section' )
				. sib_block_group_open( 'wrap prose-sec', 'div', [ 'top' => '24px', 'bottom' => '56px' ] )
				. sib_block_h( 2, esc_html( 'What you can do with ' . $name ), 'disp h2' )
				. "<!-- wp:list -->\n<ul class=\"wp-block-list\">" . implode( '', array_map( fn( $p ) => "<!-- wp:list-item -->\n<li>" . esc_html( $p ) . "</li>\n<!-- /wp:list-item -->", $points ) ) . "</ul>\n<!-- /wp:list -->\n\n"
				. sib_seed_b( 'steps', [ 'title' => 'Set it up', 'items' => implode( "\n", $steps ), 'schema' => true ] )
				. sib_seed_b( 'faq', [ 'title' => 'Questions about ' . $name, 'items' => implode( "\n", $faq ), 'openFirst' => true ] )
				. sib_block_group_close();
			$old = $this->text_page( wp_strip_all_tags( $post->post_content ) );
			$is_first = trim( $post->post_content ) === trim( $old ) && mb_strlen( wp_strip_all_tags( $post->post_content ) ) < 200;
			if ( $is_first || $this->replaceable( $post ) ) {
				if ( md5( $content ) !== get_post_meta( $post->ID, '_sib_seed_src', true ) ) {
					wp_update_post( wp_slash( [ 'ID' => $post->ID, 'post_content' => $content, 'post_excerpt' => $excerpt ] ) );
					update_post_meta( $post->ID, '_sib_seed_src', md5( $content ) );
					$this->fingerprint( $post->ID );
					WP_CLI::log( "Updated integration {$slug}" );
				}
			}
		}
	}

	private function text_page( string $text ): string {
		return "<!-- wp:paragraph -->\n<p>" . esc_html( $text ) . "</p>\n<!-- /wp:paragraph -->\n\n";
	}

	private function terms( string $tax, array $names ): void {
		foreach ( $names as $i => $n ) {
			[ $name, $slug ] = is_array( $n ) ? $n : [ $n, sanitize_title( $n ) ];
			if ( ! term_exists( $slug, $tax ) ) {
				wp_insert_term( $name, $tax, [ 'slug' => $slug ] );
			}
		}
	}

	/** Copy a theme image into the media library once. */
	private function media( string $file ): int {
		$found = get_posts( [ 'post_type' => 'attachment', 'meta_key' => '_sib_source', 'meta_value' => $file, 'numberposts' => 1, 'fields' => 'ids' ] );
		if ( $found ) {
			return (int) $found[0];
		}
		$src = get_theme_file_path( 'assets/img/' . $file );
		if ( ! file_exists( $src ) ) {
			return 0;
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		$tmp = wp_tempnam( $file );
		copy( $src, $tmp );
		$id = media_handle_sideload( [ 'name' => $file, 'tmp_name' => $tmp ], 0 );
		if ( is_wp_error( $id ) ) {
			WP_CLI::warning( $id->get_error_message() );
			return 0;
		}
		update_post_meta( $id, '_sib_source', $file );
		return (int) $id;
	}

	private function cpt( string $type, string $slug, string $title, string $content, string $excerpt, array $meta = [], string $image = '', int $order = 0, array $terms = [] ): int {
		$existing = get_page_by_path( $slug, OBJECT, $type );
		if ( $existing && $existing->post_type === $type ) {
			return $existing->ID;
		}
		$id = wp_insert_post( wp_slash( [ 'post_type' => $type, 'post_status' => 'publish', 'post_name' => $slug, 'post_title' => $title, 'post_content' => $content, 'post_excerpt' => $excerpt, 'menu_order' => $order ] ) );
		foreach ( $meta as $k => $v ) {
			update_post_meta( $id, $k, $v );
		}
		if ( $image && ( $att = $this->media( $image ) ) ) {
			set_post_thumbnail( $id, $att );
		}
		foreach ( $terms as $tax => $slugs ) {
			wp_set_object_terms( $id, $slugs, $tax );
		}
		WP_CLI::log( "Created {$type} {$slug}" );
		return $id;
	}

	private function careers_text(): string {
		$h = fn( $t ) => sib_block_h( 2, $t, '' );
		return sib_block_p( 'We are a small team in Lagos building the app that lets people run a real shop from their phone. We hire people who listen to sellers, write in plain words and like to ship.' )
			. $h( 'How we work' )
			. "<!-- wp:list -->\n<ul class=\"wp-block-list\"><!-- wp:list-item -->\n<li>We talk to sellers every week, and everyone on the team does it.</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>We work from Lagos, with some roles open to people anywhere in Nigeria.</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>We use plain words in our product, our docs and with each other.</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->\n\n"
			. $h( 'Open roles' )
			. sib_block_p( 'We post new roles here and on our LinkedIn page. If nothing fits right now, send a short note about what you would like to work on and one thing you have built or sold to <a href="mailto:careers@shopinbos.com">careers@shopinbos.com</a>. We read every message.' );
	}

	private function press_text(): string {
		$h = fn( $t ) => sib_block_h( 2, $t, '' );
		return sib_block_p( 'For interviews, comments and images, email <a href="mailto:press@shopinbos.com">press@shopinbos.com</a>. We reply within one working day.' )
			. $h( 'About Shopinbos' )
			. sib_block_p( 'Shopinbos is an AI commerce app for Nigerian businesses, made in Lagos by Tech Della Solutions Ltd (RC 7038770). Sellers build an online store in minutes with Rex, take card, transfer and pay on delivery payments, book riders, and let Peggy answer customers on WhatsApp. Sellers can also find stock from verified Nigerian suppliers and sell it without holding inventory.' )
			. $h( 'Quick facts' )
			. "<!-- wp:list -->\n<ul class=\"wp-block-list\"><!-- wp:list-item -->\n<li>Company: Tech Della Solutions Ltd (RC 7038770), Lagos, Nigeria</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>What it does: online stores, payments, delivery and AI helpers for small businesses</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>Plans: Free plan, then Starter ₦6,000, Growth ₦18,000 and Pro ₦40,000 a month</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>Languages: English and Pidgin, with Yorùbá, Hausa and Igbo planned</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->\n\n"
			. $h( 'Logos' )
			. sib_block_p( 'Download the <a href="' . esc_url( sib_theme_img( 'logo-dark.png' ) ) . '" download>dark logo</a> for light backgrounds or the <a href="' . esc_url( sib_theme_img( 'logo-light.png' ) ) . '" download>light logo</a> for dark backgrounds. Please don’t stretch, recolour or add effects to the logo.' );
	}

	/** Blog categories with their colours, and the launch posts. */
	private function blog(): void {
		require_once SIB_CORE_DIR . '/includes/seed/blog.php';
		foreach ( sib_seed_blog_categories() as $i => [ $slug, $name, $bg, $fg, $about ] ) {
			$term = term_exists( $slug, 'category' ) ?: wp_insert_term( $name, 'category', [ 'slug' => $slug, 'description' => $about ] );
			if ( ! is_wp_error( $term ) ) {
				update_term_meta( (int) $term['term_id'], 'sib_bg', $bg );
				update_term_meta( (int) $term['term_id'], 'sib_fg', $fg );
				update_term_meta( (int) $term['term_id'], 'sib_order', $i + 1 );
			}
		}
		// The old example post described a bakery with menus and a kitchen screen. Shopinbos sells food products, not menus.
		$old = get_page_by_path( 'bakery-40-orders-a-day', OBJECT, 'post' );
		if ( $old && str_contains( $old->post_content, 'One screen for the kitchen' ) ) {
			wp_trash_post( $old->ID );
			WP_CLI::log( 'Removed the bakery example post' );
		}
		foreach ( sib_seed_blog_posts() as [ $slug, $cat, $title, $dek, $date, $cover, $bg, $fit, $featured, $views, $lesson, $body ] ) {
			if ( get_page_by_path( $slug, OBJECT, 'post' ) ) {
				continue;
			}
			$id = wp_insert_post( wp_slash( [ 'post_type' => 'post', 'post_status' => 'publish', 'post_name' => $slug, 'post_title' => $title, 'post_excerpt' => $dek, 'post_content' => $body, 'post_date' => $date, 'post_author' => $this->team_author() ] ) );
			if ( ! $id || is_wp_error( $id ) ) {
				WP_CLI::warning( "Could not create post {$slug}" );
				continue;
			}
			wp_set_object_terms( $id, [ $cat ], 'category' );
			update_post_meta( $id, 'sib_cover_bg', $bg );
			update_post_meta( $id, 'sib_cover_fit', $fit );
			update_post_meta( $id, 'sib_views', $views );
			if ( $featured ) {
				update_post_meta( $id, 'sib_featured', 1 );
			}
			if ( $lesson ) {
				update_post_meta( $id, 'sib_lesson', $lesson );
			}
			if ( $att = $this->media( $cover ) ) {
				set_post_thumbnail( $id, $att );
			} else {
				update_post_meta( $id, 'sib_cover', $cover );
			}
			WP_CLI::log( "Created post {$slug}" );
		}
	}

	/** Academy tracks and lessons. The old /academy/ placeholder page is removed so the Academy archive can use the URL. */
	private function academy(): void {
		require_once SIB_CORE_DIR . '/includes/seed/blog.php';
		require_once SIB_CORE_DIR . '/includes/seed/academy.php';
		$old = get_page_by_path( 'academy' );
		if ( $old && ( str_contains( $old->post_content, 'is coming soon' ) || '' === trim( wp_strip_all_tags( $old->post_content ) ) ) ) {
			wp_delete_post( $old->ID, true );
			WP_CLI::log( 'Removed the placeholder /academy/ page' );
		} elseif ( $old ) {
			WP_CLI::warning( 'A page at /academy/ hides the Academy. Move or delete it.' );
		}
		$lessons = sib_seed_academy_lessons();
		foreach ( sib_seed_academy_tracks() as $i => [ $slug, $name, $blurb, $bg, $fg, $icon ] ) {
			$term = term_exists( $slug, 'sib_track' ) ?: wp_insert_term( $name, 'sib_track', [ 'slug' => $slug, 'description' => $blurb ] );
			if ( is_wp_error( $term ) ) {
				WP_CLI::warning( $term->get_error_message() );
				continue;
			}
			$tid = (int) $term['term_id'];
			foreach ( [ 'sib_bg' => $bg, 'sib_fg' => $fg, 'sib_icon' => $icon, 'sib_order' => $i + 1 ] as $k => $v ) {
				update_term_meta( $tid, $k, $v );
			}
			foreach ( $lessons[ $slug ] ?? [] as $n => $l ) {
				$this->cpt( 'sib_lesson', sanitize_title( $l[0] ), $l[0], sib_seed_lesson_markup( $l ), $l[2], [], '', $n + 1, [ 'sib_track' => [ $tid ] ] );
			}
		}
	}

	/**
	 * Academy curriculum (seed/academy.json): bring stored tracks and lessons up to date, before academy() adds
	 * anything missing. A lesson is found by its slug or an old slug in "was" (renamed in place, so WordPress keeps
	 * the old address as a redirect), and only rewritten while nobody has edited it (replaceable()). Track names
	 * and descriptions change only while they still hold what setup wrote. Seeded lessons no longer in the
	 * curriculum go back to draft.
	 */
	private function academy_curriculum(): void {
		global $wpdb;
		require_once SIB_CORE_DIR . '/includes/seed/blog.php';
		require_once SIB_CORE_DIR . '/includes/seed/academy.php';
		$tuples = sib_seed_academy_lessons();
		$keep   = [];
		// name + description hashes written by setup before the curriculum had fingerprints.
		$legacy = [ 'ddfd3ef4643f1b5bed309c68b7019216', 'a613f8a94fd864ea5f573b8b1723ecdb', '2d8bfb00d32f6c96a91133bc2624f12b', '30b745ed22795cbf46ef7d3888a01f7b', '6bd41bea0ec76e0c92990b9fc0ca1de9', '9884f89eee892fc4ae4771ff95236999', 'c20ee3cb9fe24bcf287854e4f1775aa0', '28f28c2580aaf17f83188416de05e515' ];
		foreach ( sib_seed_academy_data() as $t ) {
			$term = get_term_by( 'slug', $t['slug'], 'sib_track' );
			if ( ! $term ) {
				$made = wp_insert_term( $t['name'], 'sib_track', [ 'slug' => $t['slug'], 'description' => $t['about'] ] );
				if ( is_wp_error( $made ) ) {
					WP_CLI::warning( $made->get_error_message() );
					continue;
				}
				$tid  = (int) $made['term_id'];
				$mine = true;
				WP_CLI::log( "Created Academy track {$t['slug']}" );
			} else {
				$tid  = (int) $term->term_id;
				$was  = md5( $term->name . "\n" . $term->description );
				$mine = ( $print = get_term_meta( $tid, '_sib_seed_hash', true ) ) ? $print === $was : in_array( $was, $legacy, true );
				if ( $mine && $was !== md5( $t['name'] . "\n" . $t['about'] ) ) {
					wp_update_term( $tid, 'sib_track', [ 'name' => $t['name'], 'description' => $t['about'] ] );
					WP_CLI::log( "Updated Academy track {$t['slug']}" );
				} elseif ( ! $mine ) {
					WP_CLI::log( "Kept Academy track {$t['slug']} (edited by hand)" );
				}
			}
			if ( $mine ) {
				update_term_meta( $tid, '_sib_seed_hash', md5( $t['name'] . "\n" . $t['about'] ) );
			}
			update_term_meta( $tid, 'sib_for', (string) ( $t['for'] ?? '' ) );
			update_term_meta( $tid, 'sib_learn', implode( "\n", (array) ( $t['learn'] ?? [] ) ) );
			update_term_meta( $tid, 'sib_biz', (string) ( $t['biz'] ?? '' ) );
			update_term_meta( $tid, 'sib_biz_cta', implode( ' | ', (array) ( $t['biz_cta'] ?? [] ) ) );

			foreach ( $t['lessons'] as $n => $l ) {
				$slug    = sanitize_title( $l['title'] );
				$content = sib_seed_lesson_markup( $tuples[ $t['slug'] ][ $n ] );
				$names   = array_values( array_unique( array_merge( [ $slug ], (array) ( $l['was'] ?? [] ) ) ) );
				$keep    = array_merge( $keep, $names );
				$ids     = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'sib_lesson' AND post_status <> 'trash' AND post_name IN (" . implode( ',', array_fill( 0, count( $names ), '%s' ) ) . ') ORDER BY post_name = %s DESC, ID ASC', ...array_merge( $names, [ $slug ] ) ) ); // phpcs:ignore
				$post    = $ids ? get_post( (int) $ids[0] ) : null;
				if ( ! $post ) {
					$id = wp_insert_post( wp_slash( [ 'post_type' => 'sib_lesson', 'post_status' => 'publish', 'post_name' => $slug, 'post_title' => $l['title'], 'post_content' => $content, 'post_excerpt' => $l['intro'], 'menu_order' => $n + 1 ] ) );
					if ( is_wp_error( $id ) || ! $id ) {
						continue;
					}
					wp_set_object_terms( $id, [ $tid ], 'sib_track' );
					update_post_meta( $id, '_sib_seed_src', md5( $content ) );
					$this->fingerprint( $id );
					WP_CLI::log( "Created lesson {$slug}" );
					continue;
				}
				if ( ! $this->replaceable( $post ) ) {
					if ( $post->post_name !== $slug ) {
						WP_CLI::warning( "Lesson {$post->post_name} was edited by hand, so it was not replaced by “{$l['title']}”." );
					}
					continue;
				}
				$terms = wp_get_object_terms( $post->ID, 'sib_track', [ 'fields' => 'ids' ] );
				if ( md5( $content ) === get_post_meta( $post->ID, '_sib_seed_src', true ) && $post->post_name === $slug && $post->post_title === $l['title'] && (int) $post->menu_order === $n + 1 && 'publish' === $post->post_status && [ $tid ] === array_map( 'intval', (array) $terms ) ) {
					continue; // already up to date
				}
				wp_update_post( wp_slash( [ 'ID' => $post->ID, 'post_name' => $slug, 'post_title' => $l['title'], 'post_content' => $content, 'post_excerpt' => $l['intro'], 'menu_order' => $n + 1, 'post_status' => 'publish' ] ) );
				wp_set_object_terms( $post->ID, [ $tid ], 'sib_track' );
				update_post_meta( $post->ID, '_sib_seed_src', md5( $content ) );
				$this->fingerprint( $post->ID );
				WP_CLI::log( 'Updated lesson ' . ( $post->post_name !== $slug ? "{$post->post_name} → " : '' ) . $slug );
			}
		}
		foreach ( get_posts( [ 'post_type' => 'sib_lesson', 'post_status' => 'publish', 'numberposts' => -1 ] ) as $old ) {
			if ( ! in_array( $old->post_name, $keep, true ) && get_post_meta( $old->ID, '_sib_seed_hash', true ) && $this->replaceable( $old ) ) {
				wp_update_post( [ 'ID' => $old->ID, 'post_status' => 'draft' ] );
				WP_CLI::log( "Retired lesson {$old->post_name} (no longer in the curriculum)" );
			}
		}
	}

	/**
	 * Articles from the team's Google Docs (seed/articles.json), plus colours for the team's own categories.
	 * A post is only created when its slug is not on the site yet, so live posts are never duplicated or overwritten.
	 */
	private function articles(): void {
		foreach ( [ 'how-to-sell' => [ 'How to Sell', '#FFEDE4', '#B23E0A' ], 'what-to-sell' => [ 'What to Sell', '#E3EEFD', '#1F5FBF' ], 'where-to-sell' => [ 'Where to Sell', '#E7E1FF', '#5B3FD6' ], 'start-a-shop' => [ 'Start a shop', '#E2F5EA', '#16794A' ] ] as $slug => [ $name, $bg, $fg ] ) {
			$term = term_exists( $slug, 'category' );
			if ( ! $term && in_array( $slug, [ 'how-to-sell', 'what-to-sell', 'where-to-sell' ], true ) ) {
				$term = wp_insert_term( $name, 'category', [ 'slug' => $slug ] );
			}
			if ( $term && ! is_wp_error( $term ) && ! get_term_meta( (int) $term['term_id'], 'sib_bg', true ) ) {
				update_term_meta( (int) $term['term_id'], 'sib_bg', $bg );
				update_term_meta( (int) $term['term_id'], 'sib_fg', $fg );
			}
		}
		$file = SIB_CORE_DIR . '/includes/seed/articles.json';
		$list = file_exists( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : [];
		foreach ( (array) $list as $a ) {
			if ( get_page_by_path( $a['slug'], OBJECT, 'post' ) ) {
				continue;
			}
			$id = wp_insert_post( wp_slash( [ 'post_type' => 'post', 'post_status' => 'publish', 'post_name' => $a['slug'], 'post_title' => $a['title'], 'post_excerpt' => $a['excerpt'], 'post_content' => $a['content'], 'post_date' => $a['date'], 'post_author' => $this->team_author() ] ) );
			if ( ! $id || is_wp_error( $id ) ) {
				WP_CLI::warning( "Could not create post {$a['slug']}" );
				continue;
			}
			wp_set_object_terms( $id, [ $a['category'] ], 'category' );
			update_post_meta( $id, 'sib_cover_bg', $a['cover_bg'] );
			if ( $att = $this->media( $a['cover'] ) ) {
				set_post_thumbnail( $id, $att );
			}
			foreach ( [ 'rank_math_title' => $a['meta_title'], 'rank_math_description' => $a['excerpt'], 'rank_math_focus_keyword' => $a['keyword'] ] as $k => $v ) {
				if ( $v ) {
					update_post_meta( $id, $k, $v );
				}
			}
			WP_CLI::log( "Created post {$a['slug']}" );
		}
	}

	/**
	 * Free PDFs (lead magnets) from seed/resources.json: one gated guide page each. The PDF goes to the private
	 * folder and is only sent by signed link after the form. Existing guides are left alone.
	 */
	private function resources(): void {
		$file = SIB_CORE_DIR . '/includes/seed/resources.json';
		$list = file_exists( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : [];
		$kind = [ 'guide' => 'guide', 'workbook' => 'workbook', 'template' => 'template pack', 'checklist' => 'checklist' ];
		foreach ( (array) $list as $i => $r ) {
			$existing = get_page_by_path( $r['slug'], OBJECT, 'sib_resource' );
			$items   = implode( "\n", array_map( fn( $c ) => "<!-- wp:list-item -->\n<li>" . esc_html( $c ) . "</li>\n<!-- /wp:list-item -->", $r['chapters'] ) );
			// The Starter Kit has its own page from the design canvas (theme canvas/pdf-NN.html).
			$canvas  = 'online-sellers-starter-kit' === $r['slug'] && function_exists( 'sib_canvas_blocks' ) ? sib_canvas_blocks( 'pdf' ) : '';
			$content = $canvas ?: sib_block_p( esc_html( $r['sub'] ) )
				. sib_block_h( 2, 'What’s inside', '' )
				. ( $items ? "<!-- wp:list -->\n<ul class=\"wp-block-list\">" . $items . "</ul>\n<!-- /wp:list -->\n\n" : '' )
				. sib_block_p( esc_html( sprintf( 'A free %1$s from Shopinbos. %2$d pages, PDF. Fill in the form and it opens straight away; we also send you the link.', $kind[ $r['style'] ] ?? 'guide', $r['pages'] ) ) );
			if ( $existing && 'sib_resource' === $existing->post_type ) {
				$id = $this->refresh_post( $existing, $r['title'], $content, $r['sub'], $canvas ? 'page-canvas' : '', $i + 10 );
			} else {
				// Create the guide first: media items get slugs too, and must not take the guide's URL.
				$id = $this->cpt( 'sib_resource', $r['slug'], $r['title'], $content, $r['sub'], array_filter( [ 'sib_gated' => true, 'sib_list_tag' => $r['slug'], '_wp_page_template' => $canvas ? 'page-canvas' : '' ] ), '', $i + 10 );
				update_post_meta( $id, '_sib_seed_src', md5( $content ) );
				$this->fingerprint( $id );
			}
			// Use this version of the PDF and cover, unless someone picked their own file in the editor.
			$current = (int) get_post_meta( $id, 'sib_file_id', true );
			if ( ! $current || str_starts_with( (string) get_post_meta( $current, '_sib_source', true ), 'plugin:' ) ) {
				$pdf = $this->media_from( SIB_CORE_DIR . '/includes/seed/pdfs/' . $r['slug'] . '.pdf', $r['title'] . ' (PDF)' );
				if ( $pdf && $pdf !== $current ) {
					update_post_meta( $id, 'sib_file_id', $pdf );
					sib_secure_resource_file( $id );
					if ( $cover = $this->media_from( SIB_CORE_DIR . '/includes/seed/pdfs/' . $r['slug'] . '.webp', $r['title'] . ' cover' ) ) {
						set_post_thumbnail( $id, $cover );
					}
				}
			}
			update_post_meta( $id, 'sib_pages', (int) $r['pages'] );
			update_post_meta( $id, 'sib_style', (string) $r['style'] );
			update_post_meta( $id, 'sib_chapters', array_values( (array) $r['chapters'] ) );
			foreach ( [ 'rank_math_title' => $r['meta_title'], 'rank_math_description' => $r['sub'], 'rank_math_focus_keyword' => $r['keyword'] ] as $k => $v ) {
				if ( $v ) {
					update_post_meta( $id, $k, $v );
				}
			}
		}
	}

	/** Copy any file into the media library once (keyed by its path inside the plugin). */
	private function media_from( string $path, string $title ): int {
		if ( ! file_exists( $path ) ) {
			return 0;
		}
		$key   = 'plugin:' . basename( $path ) . ':' . md5_file( $path ); // a new version of the file is a new media item
		$found = get_posts( [ 'post_type' => 'attachment', 'post_status' => 'any', 'meta_key' => '_sib_source', 'meta_value' => $key, 'numberposts' => 1, 'fields' => 'ids' ] );
		if ( $found ) {
			return (int) $found[0];
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		$tmp = wp_tempnam( basename( $path ) );
		copy( $path, $tmp );
		$id = media_handle_sideload( [ 'name' => basename( $path ), 'tmp_name' => $tmp ], 0, $title );
		if ( is_wp_error( $id ) ) {
			WP_CLI::warning( $id->get_error_message() );
			return 0;
		}
		update_post_meta( $id, '_sib_source', $key );
		return (int) $id;
	}

	/**
	 * Pages left by the old theme: rebuild what they showed and tidy what is no longer needed.
	 *   - Features and solutions become sib_feature / sib_solution posts at the same URLs.
	 *   - Partners, agencies and How it works get real content.
	 *   - Empty old pages whose URL now belongs to an archive or another page are trashed (redirects.php
	 *     sends their old URLs to the right place). Pages with content are never trashed.
	 */
	private function old_pages(): void {
		require_once SIB_CORE_DIR . '/includes/seed/blog.php';
		require_once SIB_CORE_DIR . '/includes/seed/pages.php';

		// Empty pages that would hide the new sections, or duplicate another page.
		$retire = [ 'features/logistics', 'features/payments', 'features/peggy-ai', 'features/social-selling', 'features/store-management', 'features/storefront', 'features',
			'solutions/beauty', 'solutions/electronics', 'solutions/fashion', 'solutions/food', 'solutions',
			'partners/logistics', 'partners/logistics-2', 'partners/supplier', 'partners/supplier-2',
			'legal/privacy-2', 'legal/terms-2', 'legal/ndpr', 'legal/cookies-2', 'partners/agencies-2',
			'help', 'templates', 'tools', 'marketplace', 'status', 'academy' ];
		foreach ( $retire as $path ) {
			foreach ( $this->pages_at( $path ) as $old ) {
				if ( $this->replaceable( $old ) && '' === trim( wp_strip_all_tags( $old->post_content ) ) ) {
					wp_trash_post( $old->ID );
					WP_CLI::log( "Retired empty old page /{$path}/" );
				}
			}
		}
		// Rules in the Redirection plugin that send a section URL elsewhere (one sent /templates/ to /how-it-works).
		global $wpdb;
		$table = $wpdb->prefix . 'redirection_items';
		if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === $table ) {
			foreach ( sib_reserved_paths() as $path ) {
				$n = $wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE url IN (%s, %s) AND action_type = 'url'", untrailingslashit( $path ), $path ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				if ( $n ) {
					WP_CLI::log( "Removed a Redirection rule that sent {$path} elsewhere" );
				}
			}
		}
		// Old slugs that WordPress would follow away from a section URL (e.g. /templates/ to another page).
		global $wpdb;
		foreach ( sib_reserved_paths() as $path ) {
			if ( $wpdb->delete( $wpdb->postmeta, [ 'meta_key' => '_wp_old_slug', 'meta_value' => trim( $path, '/' ) ] ) ) {
				WP_CLI::log( "Cleared an old slug that redirected {$path}" );
			}
		}
		$this->dedupe_pages();

		foreach ( sib_seed_landings() as $i => $d ) {
			// The canvas landing sections (theme canvas/land-<slug>-NN.html) when they exist.
			$content  = function_exists( 'sib_canvas_blocks' ) && sib_canvas_blocks( 'land-' . $d['slug'] ) ? sib_canvas_blocks( 'land-' . $d['slug'] ) : sib_seed_landing_markup( $d );
			$existing = get_page_by_path( $d['slug'], OBJECT, $d['type'] );
			if ( $existing && $existing->post_type === $d['type'] ) {
				$id = $this->refresh_post( $existing, $d['title'], $content, $d['excerpt'], '', $i + 1 );
			} else {
				$id = $this->cpt( $d['type'], $d['slug'], $d['title'], $content, $d['excerpt'], [ 'sib_cta_intent' => '', 'sib_reviewed' => gmdate( 'Y-m-d' ) ], str_contains( $d['img'], '.' ) ? $d['img'] : 'c/' . $d['img'] . '.webp', $i + 1 );
				update_post_meta( $id, '_sib_seed_src', md5( $content ) );
				$this->fingerprint( $id );
			}
			update_post_meta( $id, 'rank_math_description', $d['excerpt'] );
		}

		foreach ( sib_seed_partner_pages() as [ $slug, $title, $content, $excerpt, $parent_slug ] ) {
			$parent = $parent_slug ? get_page_by_path( $parent_slug ) : null;
			$this->refresh_page( $slug, $title, $content, 'page-canvas', $excerpt, $parent ? $parent->ID : 0 );
		}
		$this->refresh_page( 'how-it-works', 'How it works', sib_seed_how_it_works( fn( $slug ) => $this->pattern( $slug ) ), 'page-canvas', 'Find products, sell them everywhere, run your store, talk to your customers and get paid.' );
	}

	/** Published pages at a path, oldest first. */
	private function pages_at( string $path ): array {
		$parts  = explode( '/', $path );
		$slug   = array_pop( $parts );
		$parent = $parts ? get_page_by_path( implode( '/', $parts ) ) : null;
		if ( $parts && ! $parent ) {
			return [];
		}
		return get_posts( [ 'post_type' => 'page', 'name' => $slug, 'post_parent' => $parent ? $parent->ID : 0, 'post_status' => 'publish', 'numberposts' => 10, 'orderby' => 'ID', 'order' => 'ASC' ] );
	}

	/**
	 * Compare pages: the canvas comparisons (seed/comparisons.json) as Compare blocks, and the blog's platform
	 * comparison articles moved into /compare/ (their /blog/ URLs redirect, see redirects.php).
	 */
	private function comparisons(): void {
		require_once SIB_CORE_DIR . '/includes/seed/blog.php';
		$file = SIB_CORE_DIR . '/includes/seed/comparisons.json';
		foreach ( (array) json_decode( (string) file_get_contents( $file ), true ) as $i => $c ) {
			// The canvas compare sections (theme canvas/cmp-<slug>-NN.html) when they exist, else the Compare block.
			$canvas  = function_exists( 'sib_canvas_blocks' ) ? sib_canvas_blocks( 'cmp-' . $c['slug'] ) : '';
			$content = $canvas ?: sib_seed_b( 'compare', [
				'competitor'  => $c['competitor'],
				'lastChecked' => '2026-10-14',
				'h1'          => $c['h1'],
				'sub'         => $c['sub'],
				'chooseUs'    => implode( "\n", $c['us'] ),
				'chooseThem'  => implode( "\n", $c['them'] ),
				'rows'        => implode( "\n", $c['rows'] ),
				'steps'       => implode( "\n", $c['steps'] ),
				'faq'         => implode( "\n", $c['faq'] ),
				'kws'         => implode( "\n", $c['kws'] ),
			] );
			$existing = get_page_by_path( $c['slug'], OBJECT, 'sib_comparison' );
			if ( $existing && 'sib_comparison' === $existing->post_type ) {
				$this->refresh_post( $existing, $c['title'], $content, $c['sub'], '', $i + 1 );
				if ( ! get_post_meta( $existing->ID, 'sib_last_checked', true ) ) {
					update_post_meta( $existing->ID, 'sib_last_checked', '2026-10-14' );
				}
				continue;
			}
			$id = $this->cpt( 'sib_comparison', $c['slug'], $c['title'], $content, $c['sub'], [ 'sib_last_checked' => '2026-10-14', 'sib_cta_intent' => 'import' ], '', $i + 1 );
			update_post_meta( $id, '_sib_seed_src', md5( $content ) );
			$this->fingerprint( $id );
		}
		// Platform comparison articles from the blog.
		foreach ( [ 'woocommerce-vs-shopify', 'top-ecommerce-platforms-compared', 'best-online-store-builder' ] as $n => $slug ) {
			$post = get_page_by_path( $slug, OBJECT, 'post' );
			if ( ! $post || 'post' !== $post->post_type ) {
				continue;
			}
			$body = sib_block_group_open( 'land-hero', 'section' ) . sib_block_group_open( 'wrap col cmp-article', 'div', [ 'top' => '40px', 'bottom' => '32px' ] )
				. sib_block_h( 1, esc_html( get_the_title( $post ) ), 'disp h1 mw-900' )
				. ( $post->post_excerpt ? sib_block_p( esc_html( $post->post_excerpt ), 'lead mw-760' ) : '' )
				. sib_block_group_close() . sib_block_group_close( 'section' )
				. sib_block_group_open( 'wrap art-body cmp-article', 'div', [ 'top' => '24px', 'bottom' => '64px' ] ) . $post->post_content . sib_block_group_close();
			wp_update_post( wp_slash( [ 'ID' => $post->ID, 'post_type' => 'sib_comparison', 'post_content' => $body, 'menu_order' => 10 + $n ] ) );
			update_post_meta( $post->ID, 'sib_last_checked', get_the_modified_date( 'Y-m-d', $post ) );
			WP_CLI::log( "Moved blog post {$slug} to /compare/{$slug}/" );
		}
	}

	/** "Shopinbos team" author for posts written by the team. */
	private function team_author(): int {
		$user = get_user_by( 'login', 'shopinbos-team' );
		if ( $user ) {
			return $user->ID;
		}
		$id = wp_insert_user( [ 'user_login' => 'shopinbos-team', 'user_pass' => wp_generate_password( 32 ), 'user_email' => 'team@shopinbos.com', 'display_name' => 'Shopinbos team', 'nickname' => 'Shopinbos team', 'role' => 'author', 'description' => 'Guides from the people who build Shopinbos, checked with sellers in Lagos, Abuja and Port Harcourt.' ] );
		return is_wp_error( $id ) ? 1 : (int) $id;
	}

	private function store_templates(): void {
		$templates = [
			[ 'breeze', 'Breeze', 'Fashion', '#EAF7F8', '#1B2228', 'linen-shirt.webp', 'Light and airy, for clothing brands that want their photos to do the talking.' ],
			[ 'noir', 'Noir', 'Luxury', '#121212', '#F4EFE6', 'check-blazer.webp', 'Dark, quiet and premium, with gold buttons. For luxury and evening wear.' ],
			[ 'plain', 'Plain', 'Any shop', '#F3F3F3', '#121212', 'knit-sweater.webp', 'Clean and simple. Works for any kind of shop.' ],
			[ 'adire', 'Adire', 'Fashion', '#F3EDE6', '#2A2018', 'linen-set.webp', 'Warm tones and editorial type, inspired by Yoruba textile craft.' ],
			[ 'pantry', 'Pantry', 'Food and drinks', '#FFF4DA', '#3A2A00', 'store-hero.webp', 'Bright and appetising, with packs, bundles and delivery times up front.' ],
			[ 'ile', 'Ilé', 'Home and living', '#E8EFEA', '#15322A', 'camel-coat.webp', 'Calm and roomy, for furniture, décor and home goods.' ],
			[ 'plug', 'Plug', 'Gadgets', '#16171C', '#FFFFFF', 'earbuds.webp', 'Sharp and dark, with specs and comparison tables for electronics.' ],
			[ 'stride', 'Stride', 'Shoes', '#FFE9DD', '#3A1A08', 'suede-lace-ups.webp', 'Big product photos and a size guide on every page. Made for shoe shops.' ],
		];
		foreach ( $templates as $i => [ $key, $name, $kind, $bg, $ink, $img, $about ] ) {
			$this->cpt( 'sib_template', $key, $name, $this->text_page( $about ), $about, [ 'sib_tpl_key' => $key, 'sib_tpl_kind' => $kind, 'sib_tpl_bg' => $bg, 'sib_tpl_ink' => $ink, 'sib_cta_intent' => 'template', 'sib_cta_args' => 'template=' . $key ], $img, $i );
			// Earlier copy described food menus; Shopinbos food shops sell products.
			$old = get_page_by_path( $key, OBJECT, 'sib_template' );
			if ( $old && str_contains( $old->post_content, 'with menus,' ) ) {
				wp_update_post( wp_slash( [ 'ID' => $old->ID, 'post_content' => $this->text_page( $about ), 'post_excerpt' => $about ] ) );
			}
		}
	}

	private function tools(): void {
		$faq = fn( array $qa ) => '<!-- wp:group {"className":"faq","layout":{"type":"default"}} -->' . "\n<div class=\"wp-block-group faq\">"
			. implode( '', array_map( fn( $x ) => "<!-- wp:details -->\n<details class=\"wp-block-details\"><summary>{$x[0]}</summary><!-- wp:paragraph -->\n<p>{$x[1]}</p>\n<!-- /wp:paragraph --></details>\n<!-- /wp:details -->\n\n", $qa ) )
			. "</div>\n<!-- /wp:group -->\n\n";
		$h   = fn( $t ) => "<!-- wp:heading -->\n<h2 class=\"wp-block-heading\">{$t}</h2>\n<!-- /wp:heading -->\n\n";
		$tools = [
			[ 'profit-margin-calculator', 'Profit margin calculator', 'profit-margin', 'See what you really keep from a sale after the product, delivery, packaging and payment fees.',
				$h( 'How to use it' ) . $this->text_page( 'Type your selling price and what the product costs you. Add delivery if you offer free delivery, and any packaging. The calculator takes off the Paystack fee for card and transfer payments.' )
				. $h( 'Questions' ) . $faq( [ [ 'What is a good profit margin for a small shop?', 'It depends on what you sell, but many fashion and beauty shops aim for 30% to 50% after all costs. If yours is under 20%, look at your delivery and packaging costs first.' ], [ 'Does pay on delivery cost a fee?', 'No extra payment fee. Pay on delivery is on the Growth and Pro plans, and cash or transfer to the rider costs nothing on top of delivery.' ] ] ) ],
			[ 'selling-price-calculator', 'Selling price calculator', 'selling-price', 'Pick the profit margin you want and get the price to charge, with payment fees included.',
				$h( 'How to use it' ) . $this->text_page( 'Enter your cost and the margin you want. The price is rounded up to the next ₦100 so it looks clean on your store.' )
				. $h( 'Questions' ) . $faq( [ [ 'What is the difference between margin and markup?', 'Margin is profit as a share of the selling price. Markup is profit as a share of the cost. A 50% margin is a 100% markup.' ] ] ) ],
			[ 'paystack-fee-calculator', 'Paystack fee calculator', 'paystack-fee', 'Work out the Paystack fee on any amount, with the ₦100 waiver under ₦2,500 and the ₦2,000 cap.',
				$h( 'How the fee works' ) . $this->text_page( 'For local cards, transfers and USSD, Paystack charges 1.5% plus ₦100. The ₦100 is waived on payments under ₦2,500, and the fee is capped at ₦2,000. Check Paystack’s pricing page for the latest rates.' )
				. $h( 'Questions' ) . $faq( [ [ 'Should I pass the fee to my customer?', 'You can, but many customers prefer one clear price. Try adding it to your product price instead.' ] ] ) ],
			[ 'whatsapp-link-generator', 'WhatsApp link and QR maker', 'whatsapp-link', 'Make an "order on WhatsApp" link and QR code with a pre-filled message, for your bio, flyers and packaging.',
				$h( 'How to use it' ) . $this->text_page( 'Type your WhatsApp number and the message you want customers to send. Copy the link into your Instagram bio or download the QR code for flyers and stickers.' )
				. $h( 'Questions' ) . $faq( [ [ 'Does the QR code expire?', 'No. It is just your link, so it works for as long as your number does.' ] ] ) ],
			[ 'landed-cost-calculator', 'Landed cost calculator (China)', 'landed-cost', 'Turn a 1688 or Alibaba price in yuan into a cost per piece in naira, with shipping and fees.',
				$h( 'How to use it' ) . $this->text_page( 'Enter the price per piece in yuan, how many you are buying, today’s rate from your agent and the shipping price per kg. Add any China delivery and clearing fees.' )
				. $h( 'Questions' ) . $faq( [ [ 'Air or sea?', 'Air is faster (about 1 to 2 weeks) and priced per kg. Sea is slower (6 to 10 weeks) and priced per CBM, so it suits bulky goods.' ] ] ) ],
			[ 'break-even-calculator', 'Break-even calculator', 'break-even', 'Find how many sales you need each month to cover your running costs, and what that means per day.',
				$h( 'How to use it' ) . $this->text_page( 'Add what your shop costs to run each month (data, rent, your plan, ads), your selling price and what each item costs you. The calculator takes off the payment fee and tells you the sales you need before you make a profit.' )
				. $h( 'Questions' ) . $faq( [ [ 'What counts as a running cost?', 'Anything you pay whether you sell or not: data, rent, your Shopinbos plan, staff and regular ads.' ], [ 'How do I break even faster?', 'Raise your price a little, lower your cost per item, or cut a running cost you don’t need. Small changes to the price usually help most.' ] ] ) ],
			[ 'discount-calculator', 'Discount and sale calculator', 'discount', 'See what you keep after a discount, and how many more sales you need to earn the same.',
				$h( 'How to use it' ) . $this->text_page( 'Enter your normal price, what the item costs you and the discount you are thinking of. Use it before Black Friday, Christmas and payday sales so a discount doesn’t quietly eat your profit.' )
				. $h( 'Questions' ) . $faq( [ [ 'Is 20% off a good discount?', 'Only if your margin can take it. If you keep ₦9,000 on a ₦20,000 item, 20% off leaves about ₦5,000, so you need nearly twice the sales to earn the same.' ], [ 'What can I offer instead of a discount?', 'Free delivery above an amount, a small gift, or a bundle. These often cost you less than money off.' ] ] ) ],
			[ 'ad-budget-calculator', 'Ad budget calculator', 'ad-budget', 'Plan an Instagram, Facebook or TikTok ad budget: total spend, orders to expect and profit after ads.',
				$h( 'How to use it' ) . $this->text_page( 'Enter your daily budget, how many days, what an order cost you in ads before (or a careful guess) and your profit per order. If profit after ads is below zero, lower the cost per order or raise your price before you spend more.' )
				. $h( 'Questions' ) . $faq( [ [ 'How much should I spend on ads at first?', 'Start small, like ₦2,000 to ₦5,000 a day, on a product that already sells without ads. Check results after three days.' ], [ 'What is cost per order?', 'Your ad spend divided by the orders the ads brought. Your ad manager shows it as cost per result.' ] ] ) ],
			[ 'business-name-generator', 'Business name generator', 'business-name', 'Get name ideas for your online shop from what you sell and a word you like, in four styles.',
				$h( 'How to use it' ) . $this->text_page( 'Type what you sell and a word you like, such as your name, your area or a feeling. Pick a style and you get name ideas straight away. Change the words to get more.' )
				. $h( 'Before you choose' ) . $faq( [ [ 'How do I know a name is free?', 'Search it on Instagram, TikTok and as a domain, and check the CAC portal before you register it.' ], [ 'Can I change my shop name later?', 'Yes. On Shopinbos you can change your store name and keep your products, orders and customers.' ] ] ) ],
			[ 'product-description-generator', 'Product description writer', 'product-description', 'Turn a few details into a store description, a WhatsApp message and an Instagram caption you can copy.',
				$h( 'How to use it' ) . $this->text_page( 'Fill in the product name, what it is made of, its size, who it is for, the price and delivery. You get three ready-to-copy versions. Edit them so they sound like you.' )
				. $h( 'Questions' ) . $faq( [ [ 'How long should a product description be?', 'Short enough to read on a phone: what it is, the details buyers ask about, the price and delivery. Two to four lines works for most products.' ], [ 'Can Peggy write these for me?', 'Yes. In the Shopinbos app, Peggy drafts descriptions and captions from your photos.' ] ] ) ],
		];
		foreach ( $tools as $i => [ $slug, $title, $tool, $excerpt, $content ] ) {
			$this->cpt( 'sib_tool', $slug, $title, $content, $excerpt, [ 'sib_tool' => $tool, 'sib_cta_intent' => 'tool_result', 'sib_cta_args' => 'tool=' . $tool ], '', $i );
		}
	}

	private function samples(): void {
		$p  = fn( $t, $c = '' ) => sib_block_p( $t, $c );
		$hd = fn( $l, $t, $c = 'disp h2' ) => sib_block_h( $l, $t, $c );

		// Feature: Pay on delivery, built from the same sections as the feature template.
		$feature = sib_block_group_open( 'bg-mist', 'section' ) . sib_block_group_open( 'wrap split', 'div', [ 'top' => '56px', 'bottom' => '72px' ] )
			. sib_block_group_open( 'col-22' ) . $p( 'Pay on delivery', 'eyebrow' ) . $hd( 1, 'Take pay on delivery without the fake orders', 'disp h1 h1-58' )
			. $p( 'Your customer pays the rider in cash or by transfer, and only hands over a 4-digit code when the parcel is in their hands. The rider pays the cash in the same evening.', 'lead' )
			. sib_block_buttons( [ [ 'Start your shop', sib_go_url(), 'accent' ], [ 'See pricing', home_url( '/pricing/' ), 'ghost' ] ] ) . sib_block_group_close()
			. sib_block_html( '<div class="tile" style="background:#FFEDE4;color:#5B3A2A"><p class="tt" style="color:#16141F">Delivery code</p><div class="row" style="gap:6px"><span class="digit">4</span><span class="digit">8</span><span class="digit">2</span><span class="digit">1</span></div><p class="ts">Code checked by the rider. Cash paid in by 6pm.</p></div>' )
			. sib_block_group_close() . sib_block_group_close( 'section' )
			. sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' ) . sib_block_sec_head( 'Why it helps', 'Cash on delivery, sorted', 'Customers who don’t trust paying first still buy, and you still get your money.' )
			. sib_block_group_open( 'g3' )
			. sib_block_group_open( 'card benefit' ) . $hd( 3, 'No more “I’m not around”', 'tt' ) . $p( 'Customers confirm their order on WhatsApp before a rider leaves, so fewer wasted trips.', 'p' ) . sib_block_group_close()
			. sib_block_group_open( 'card benefit' ) . $hd( 3, 'A code, not an argument', 'tt' ) . $p( 'The parcel is only marked delivered when the customer gives the rider their code.', 'p' ) . sib_block_group_close()
			. sib_block_group_open( 'card benefit' ) . $hd( 3, 'Paid to your bank', 'tt' ) . $p( 'The payment is confirmed when the rider enters the customer’s code, then paid out to your bank account.', 'p' ) . sib_block_group_close()
			. sib_block_group_close() . sib_block_group_close() . sib_block_group_close( 'section' )
			. '<!-- wp:pattern {"slug":"shopinbos/faq"} /-->';
		$this->cpt( 'sib_feature', 'pay-on-delivery', 'Pay on delivery', $feature, 'Take cash and transfer on delivery, confirmed with a 4-digit code. Riders pay in the same evening.', [ 'sib_reviewed' => gmdate( 'Y-m-d' ) ] );

		$this->cpt( 'sib_integration', 'paystack', 'Paystack', $this->text_page( 'Card, bank transfer and USSD payments at checkout and on payment links. Built in: nothing to set up.' ), 'Cards, bank transfer and USSD at checkout', [ 'sib_integration_status' => 'live' ] );
		$this->cpt( 'sib_integration', 'whatsapp', 'WhatsApp Business', $this->text_page( 'Your catalogue, chats, payment links and order updates, in WhatsApp.' ), 'Catalogue, chats, payment links and order updates', [ 'sib_integration_status' => 'live' ] );
		$this->cpt( 'sib_integration', 'tiktok-shop', 'TikTok Shop', $this->text_page( 'Sell in videos and lives. Apply from the app.' ), 'Sell in videos and lives', [ 'sib_integration_status' => 'apply' ] );

		$steps = "<!-- wp:list {\"ordered\":true} -->\n<ol class=\"wp-block-list\"><!-- wp:list-item -->\n<li>Card and transfer payments are paid out to your bank account through Paystack, usually within a few working days.</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>Pay on delivery payments are confirmed when the rider enters the customer’s code, then paid out the same way.</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>You can see every payment and payout in the app.</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>For dropship orders, your share is held for 48 hours after delivery in case of returns.</li>\n<!-- /wp:list-item --></ol>\n<!-- /wp:list -->\n\n";
		$this->cpt( 'sib_help', 'when-do-i-get-paid', 'When do I get paid?', $this->text_page( 'Paid out to your bank account through Paystack, usually within a few working days.' ) . $steps, 'Paid out to your bank through Paystack, usually within a few working days.', [ 'sib_reviewed' => gmdate( 'Y-m-d' ), 'sib_help_area' => 'Money > Payouts' ], '', 0, [ 'sib_help_category' => [ 'payments-and-payouts' ] ] );

		$this->cpt( 'sib_resource', 'whatsapp-selling-playbook', 'The WhatsApp selling playbook', "<!-- wp:heading -->\n<h2 class=\"wp-block-heading\">What’s inside</h2>\n<!-- /wp:heading -->\n\n<!-- wp:list -->\n<ul class=\"wp-block-list\"><!-- wp:list-item -->\n<li>How to set up your WhatsApp Business catalogue</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>Status posts that sell, with 10 examples</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>Replies for price, delivery and “is it original?”</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->\n\n", 'Set up your catalogue, post Status that sells and answer every buyer question. Free PDF.', [ 'sib_gated' => true, 'sib_list_tag' => 'whatsapp-playbook' ], 'peggy-wave.webp' );
	}
}

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	WP_CLI::add_command( 'shopinbos', 'Sib_CLI' );
}
