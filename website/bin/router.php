<?php
// Router for PHP's built-in server: serve real files, send everything else to WordPress.
$path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
if ( '/' !== $path && is_file( getcwd() . $path ) && ! str_ends_with( $path, '.php' ) ) {
	return false;
}
if ( str_ends_with( $path, '.php' ) && is_file( getcwd() . $path ) ) {
	$_SERVER['SCRIPT_NAME'] = $path;
	require getcwd() . $path;
	return;
}
$_SERVER['SCRIPT_NAME'] = '/index.php';
require getcwd() . '/index.php';
