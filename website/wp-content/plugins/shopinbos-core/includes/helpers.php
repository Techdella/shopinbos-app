<?php
/**
 * Small shared helpers.
 */

defined( 'ABSPATH' ) || exit;

/** Format a naira amount the way the prototype does: ₦38,500. Other currencies get their code. */
function sib_money( $amount, string $currency = 'NGN' ): string {
	if ( null === $amount || '' === $amount ) {
		return '';
	}
	$n = number_format( (float) $amount, 0, '.', ',' );
	return 'NGN' === strtoupper( $currency ) ? '₦' . $n : strtoupper( $currency ) . ' ' . $n;
}

/** Paystack local fee: 1.5% + ₦100 (waived under ₦2,500), capped at ₦2,000. Same formula as site.js and the tools. */
function sib_paystack_fee( float $total ): int {
	return (int) min( round( $total * 0.015 + ( $total < 2500 ? 0 : 100 ) ), 2000 );
}

/** Path of a plugin view, rendered with $vars extracted. */
function sib_view( string $name, array $vars = [] ): string {
	$file = SIB_CORE_DIR . '/views/' . $name . '.php';
	if ( ! is_readable( $file ) ) {
		return '';
	}
	extract( $vars, EXTR_SKIP ); // phpcs:ignore WordPress.PHP.DontExtract
	ob_start();
	include $file;
	return (string) ob_get_clean();
}

/** Theme image URL with a fallback when the Shopinbos theme is not active. */
function sib_img( string $file ): string {
	if ( function_exists( 'sib_theme_img' ) ) {
		return sib_theme_img( $file );
	}
	return esc_url( SIB_CORE_URL . 'assets/img/' . $file );
}

function sib_icon( string $name, int $size = 22, string $stroke = 'currentColor' ): string {
	return function_exists( 'sib_theme_icon' ) ? sib_theme_icon( $name, $size, $stroke ) : '';
}

/** Client IP for rate limiting. Behind Hostinger's proxy the first X-Forwarded-For hop is the visitor. */
function sib_client_ip(): string {
	$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
	if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) && sib_setting( 'trust_proxy' ) ) {
		$ip = trim( explode( ',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'] )[0] );
	}
	return filter_var( $ip, FILTER_VALIDATE_IP ) ? $ip : '0.0.0.0';
}

/**
 * Simple fixed-window rate limit. Returns false when the caller is over the limit.
 */
function sib_rate_limit( string $bucket, int $max, int $window ): bool {
	$key   = 'sib_rl_' . md5( $bucket . '|' . sib_client_ip() );
	$count = (int) get_transient( $key );
	if ( $count >= $max ) {
		return false;
	}
	set_transient( $key, $count + 1, $window );
	return true;
}

/** HMAC signature for download and confirmation links. */
function sib_sign( string $payload ): string {
	return hash_hmac( 'sha256', $payload, wp_salt( 'auth' ) . 'sib' );
}

/** Absolute URL for a root-relative path such as a /go/ link (for emails and schema). */
function sib_absolute( string $path ): string {
	if ( preg_match( '#^https?://#', $path ) ) {
		return $path;
	}
	$home = wp_parse_url( home_url() );
	return $home['scheme'] . '://' . $home['host'] . ( isset( $home['port'] ) ? ':' . $home['port'] : '' ) . $path;
}
