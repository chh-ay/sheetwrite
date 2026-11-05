//! Day counts must match the proleptic Gregorian calendar at era and leap-year boundaries.

use super::{date_from_text, datetime_from_text, format_date, format_datetime};

#[test]
fn schema_dates_round_trip_across_leap_and_era_boundaries() {
    for (text, days) in [
        ("1970-01-01", 0),
        ("1969-12-31", -1),
        ("2000-02-29", 11_016),
        ("1900-03-01", -25_508),
        ("0000-01-01", -719_528),
        ("9999-12-31", 2_932_896),
    ] {
        assert_eq!(date_from_text(text), Some(days), "{text}");
        assert_eq!(format_date(days).as_deref(), Some(text), "{text}");
    }
}

#[test]
fn only_exact_schema_date_layouts_are_accepted() {
    for text in [
        "1900-02-29",
        "2001-02-29",
        "2024-13-01",
        "2024-00-10",
        "2024-04-31",
        "2024-1-02",
        "+2024-01-02",
        "2024-01-02 ",
        "2024/01/02",
    ] {
        assert_eq!(date_from_text(text), None, "{text}");
    }
}

#[test]
fn date_times_truncate_to_microseconds_and_format_minimally() {
    for (text, micros, formatted) in [
        ("1970-01-01T00:00:00", 0, "1970-01-01T00:00:00"),
        ("1970-01-01T00:00:00.5", 500_000, "1970-01-01T00:00:00.500"),
        (
            "1970-01-01T00:00:00.000001",
            1,
            "1970-01-01T00:00:00.000001",
        ),
        (
            "1970-01-01T00:00:00.000001999",
            1,
            "1970-01-01T00:00:00.000001",
        ),
        (
            "1969-12-31T23:59:59.999999",
            -1,
            "1969-12-31T23:59:59.999999",
        ),
        (
            "2024-02-29T12:34:56.789",
            1_709_210_096_789_000,
            "2024-02-29T12:34:56.789",
        ),
    ] {
        assert_eq!(datetime_from_text(text), Some(micros), "{text}");
        assert_eq!(
            format_datetime(micros).as_deref(),
            Some(formatted),
            "{text}"
        );
    }

    for text in [
        "1970-01-01T24:00:00",
        "1970-01-01T00:60:00",
        "1970-01-01T00:00:60",
        "1970-01-01T00:00:00.",
        "1970-01-01T00:00:00.1234567890",
        "1970-01-01 00:00:00",
        "1970-01-01T00:00:00Z",
    ] {
        assert_eq!(datetime_from_text(text), None, "{text}");
    }
}

#[test]
fn host_dates_outside_four_digit_years_use_expanded_iso_years() {
    assert_eq!(format_date(-719_529).as_deref(), Some("-0001-12-31"));
    assert_eq!(format_date(2_932_897).as_deref(), Some("+10000-01-01"));
}
