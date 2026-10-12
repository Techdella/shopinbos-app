<?php
/**
 * PostHog on every page (same project as the app). Meta and TikTok pixels only on /lp/ campaign
 * pages, and only after the visitor accepts cookies.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'wp_head', function () {
	$key = (string) sib_setting( 'posthog_key' );
	if ( ! $key || is_user_logged_in() ) {
		return;
	}
	$host = esc_url_raw( (string) sib_setting( 'posthog_host' ) );
	?>
<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(<?php echo wp_json_encode( $key ); ?>, { api_host: <?php echo wp_json_encode( $host ); ?>, person_profiles: 'identified_only', capture_pageview: true, autocapture: false });
posthog.register({ site: 'website' });
</script>
	<?php
}, 1 );

/* Cookie consent and ad pixels on campaign pages only. */
add_action( 'wp_footer', function () {
	if ( ! is_singular( 'sib_landing' ) ) {
		return;
	}
	$meta   = preg_replace( '/\D/', '', (string) sib_setting( 'meta_pixel_id' ) );
	$tiktok = preg_replace( '/[^A-Z0-9]/i', '', (string) sib_setting( 'tiktok_pixel_id' ) );
	if ( ! $meta && ! $tiktok ) {
		return;
	}
	?>
	<div id="sib-consent" class="card" hidden role="dialog" aria-label="<?php esc_attr_e( 'Cookies', 'shopinbos' ); ?>" style="position:fixed;left:16px;right:16px;bottom:16px;max-width:520px;margin:0 auto;padding:18px;z-index:50;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 40px -20px rgba(0,0,0,.4)">
		<p class="p" style="color:#16141F"><?php esc_html_e( 'We use cookies from Meta and TikTok to see which ads work. Is that okay?', 'shopinbos' ); ?> <a href="<?php echo esc_url( home_url( '/legal/privacy/' ) ); ?>"><?php esc_html_e( 'Privacy policy', 'shopinbos' ); ?></a></p>
		<div class="row"><button type="button" class="btn btn-ink btn-s" data-consent="yes"><?php esc_html_e( 'Yes, that’s fine', 'shopinbos' ); ?></button><button type="button" class="btn btn-ghost btn-s" data-consent="no"><?php esc_html_e( 'No thanks', 'shopinbos' ); ?></button></div>
	</div>
	<script>
	(function () {
		var META = <?php echo wp_json_encode( $meta ); ?>, TT = <?php echo wp_json_encode( $tiktok ); ?>, box = document.getElementById('sib-consent');
		function load() {
			if (META) { !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js'); fbq('init', META); fbq('track', 'PageView'); }
			if (TT) { !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=n;var o=d.createElement("script");o.async=!0;o.src=n+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(TT);ttq.page();}(window,document,'ttq'); }
		}
		var saved = null; try { saved = localStorage.getItem('sib_ads_consent'); } catch (e) {}
		if (saved === 'yes') { load(); return; }
		if (saved === 'no') return;
		box.hidden = false;
		box.addEventListener('click', function (e) {
			var v = e.target.getAttribute && e.target.getAttribute('data-consent');
			if (!v) return;
			try { localStorage.setItem('sib_ads_consent', v); } catch (err) {}
			box.hidden = true;
			if (v === 'yes') load();
		});
	})();
	</script>
	<?php
}, 40 );
