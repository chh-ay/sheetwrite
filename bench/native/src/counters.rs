//! Hardware counters for the timed runs, read through `perf_event_open`.
//!
//! User-space counting works at `perf_event_paranoid` 2, so no `perf` binary or
//! elevated rights are needed. On hybrid Intel CPUs the counters are opened on
//! the performance-core PMU (`cpu_core`); run the replay pinned to a P-core.
//! Other systems report no counters.

/// Names of the counters, in the order [`Counters::read`] returns them.
pub const COUNTER_NAMES: [&str; 7] = [
    "cycles",
    "instructions",
    "branches",
    "branch-misses",
    "L1d-load-misses",
    "LLC-load-misses",
    "dTLB-load-misses",
];

#[cfg(target_os = "linux")]
mod linux {
    use super::COUNTER_NAMES;

    const PERF_TYPE_HARDWARE: u32 = 0;
    const PERF_TYPE_HW_CACHE: u32 = 3;
    const HW_CPU_CYCLES: u64 = 0;
    const HW_INSTRUCTIONS: u64 = 1;
    const HW_BRANCH_INSTRUCTIONS: u64 = 4;
    const HW_BRANCH_MISSES: u64 = 5;
    const CACHE_L1D: u64 = 0;
    const CACHE_LL: u64 = 2;
    const CACHE_DTLB: u64 = 3;
    const CACHE_OP_READ: u64 = 0;
    const CACHE_RESULT_MISS: u64 = 1;
    /// `disabled`, `exclude_kernel` and `exclude_hv` in `perf_event_attr`'s flag word.
    const FLAGS_DISABLED_USER_ONLY: u64 = 1 | (1 << 5) | (1 << 6);
    const PERF_EVENT_IOC_ENABLE: libc::c_ulong = 0x2400;
    const PERF_EVENT_IOC_DISABLE: libc::c_ulong = 0x2401;
    const PERF_EVENT_IOC_RESET: libc::c_ulong = 0x2403;
    /// `PERF_ATTR_SIZE_VER8`: the fields after `flags` stay zero.
    const ATTRIBUTE_BYTES: u32 = 136;

    /// The leading fields of the kernel's `perf_event_attr`, zero-padded to
    /// [`ATTRIBUTE_BYTES`].
    #[repr(C)]
    struct EventAttribute {
        event_type: u32,
        size: u32,
        config: u64,
        sample_period: u64,
        sample_type: u64,
        read_format: u64,
        flags: u64,
        tail: [u64; 11],
    }

    fn cache_event(cache: u64) -> u64 {
        cache | (CACHE_OP_READ << 8) | (CACHE_RESULT_MISS << 16)
    }

    /// The performance-core PMU type on hybrid CPUs, encoded into the high
    /// half of `config`; zero (any PMU) elsewhere.
    fn core_pmu_type() -> u64 {
        std::fs::read_to_string("/sys/bus/event_source/devices/cpu_core/type")
            .ok()
            .and_then(|text| text.trim().parse::<u64>().ok())
            .unwrap_or(0)
    }

    pub struct Counters {
        descriptors: Vec<libc::c_int>,
    }

    impl Counters {
        /// Open every counter, or return `None` when the kernel refuses one.
        pub fn open() -> Option<Self> {
            let pmu = core_pmu_type() << 32;
            let events = [
                (PERF_TYPE_HARDWARE, HW_CPU_CYCLES),
                (PERF_TYPE_HARDWARE, HW_INSTRUCTIONS),
                (PERF_TYPE_HARDWARE, HW_BRANCH_INSTRUCTIONS),
                (PERF_TYPE_HARDWARE, HW_BRANCH_MISSES),
                (PERF_TYPE_HW_CACHE, cache_event(CACHE_L1D)),
                (PERF_TYPE_HW_CACHE, cache_event(CACHE_LL)),
                (PERF_TYPE_HW_CACHE, cache_event(CACHE_DTLB)),
            ];
            debug_assert_eq!(events.len(), COUNTER_NAMES.len());

            let mut descriptors = Vec::with_capacity(events.len());

            for (event_type, config) in events {
                let attribute = EventAttribute {
                    event_type,
                    size: ATTRIBUTE_BYTES,
                    config: config | pmu,
                    sample_period: 0,
                    sample_type: 0,
                    read_format: 0,
                    flags: FLAGS_DISABLED_USER_ONLY,
                    tail: [0; 11],
                };

                // SAFETY: `attribute` is a valid, fully initialised
                // `perf_event_attr` prefix whose `size` matches its length.
                let descriptor = unsafe {
                    libc::syscall(
                        libc::SYS_perf_event_open,
                        &attribute as *const EventAttribute,
                        0,
                        -1,
                        -1,
                        0,
                    )
                } as libc::c_int;

                if descriptor < 0 {
                    eprintln!(
                        "perf_event_open failed for {}: {}",
                        COUNTER_NAMES[descriptors.len()],
                        std::io::Error::last_os_error()
                    );
                    return None;
                }

                descriptors.push(descriptor);
            }

            Some(Self { descriptors })
        }

        fn control(&self, request: libc::c_ulong) {
            for &descriptor in &self.descriptors {
                // SAFETY: `descriptor` is an open perf event owned by `self`.
                unsafe { libc::ioctl(descriptor, request, 0) };
            }
        }

        /// Zero the counters.
        pub fn reset(&self) {
            self.control(PERF_EVENT_IOC_RESET);
        }

        /// Start counting.
        pub fn enable(&self) {
            self.control(PERF_EVENT_IOC_ENABLE);
        }

        /// Stop counting.
        pub fn disable(&self) {
            self.control(PERF_EVENT_IOC_DISABLE);
        }

        /// Totals since the last reset, in [`COUNTER_NAMES`] order.
        pub fn read(&self) -> Vec<u64> {
            self.descriptors
                .iter()
                .map(|&descriptor| {
                    let mut value = 0u64;
                    // SAFETY: a perf event read without `read_format` flags
                    // writes exactly one u64.
                    let bytes =
                        unsafe { libc::read(descriptor, (&mut value as *mut u64).cast(), 8) };
                    if bytes == 8 {
                        value
                    } else {
                        0
                    }
                })
                .collect()
        }
    }

    impl Drop for Counters {
        fn drop(&mut self) {
            for &descriptor in &self.descriptors {
                // SAFETY: closes a descriptor this value owns, once.
                unsafe { libc::close(descriptor) };
            }
        }
    }
}

#[cfg(target_os = "linux")]
pub use linux::Counters;

/// Systems without `perf_event_open` have no counters.
#[cfg(not(target_os = "linux"))]
pub struct Counters;

#[cfg(not(target_os = "linux"))]
impl Counters {
    pub fn open() -> Option<Self> {
        None
    }

    pub fn reset(&self) {}

    pub fn enable(&self) {}

    pub fn disable(&self) {}

    pub fn read(&self) -> Vec<u64> {
        Vec::new()
    }
}
