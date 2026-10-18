// date.ts reads local getters; pin the zone so the tests mean the same on a UTC CI box as on the phone.
process.env.TZ = "Asia/Bangkok";
