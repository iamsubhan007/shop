import { NextResponse } from 'next/server';
import { initialProducts, initialDeals, initialShopSettings } from '@/lib/data/initialData';
import { checkDeliveryEligibility, DEFAULT_MAX_RADIUS_KM, SHOP_COORDINATES } from '@/lib/delivery';
import { createAdminClient } from '@/lib/supabase/admin';
import { addFallbackOrder } from '@/lib/orderStore';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      customerName,
      customerPhone,
      customerEmail,
      orderType, // 'delivery' | 'pickup'
      deliveryAddress,
      deliveryCoordinates, // { lat, lng }
      items,
      paymentMethod,
      paymentReference,
      paymentProofUrl,
      specialInstructions,
      userId,
    } = body;

    // 1. Basic Validation
    if (!customerName || !customerPhone) {
      return NextResponse.json(
        { error: 'Customer name and phone number are required.' },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Order must contain at least one item.' },
        { status: 400 }
      );
    }

    // 2. Delivery Radius Validation (Server-side)
    let distanceKm = null;
    let deliveryFee = 0;

    if (orderType === 'delivery') {
      if (!deliveryCoordinates || deliveryCoordinates.lat === undefined || deliveryCoordinates.lng === undefined) {
        return NextResponse.json(
          { error: 'Live location coordinates are required for delivery orders to verify our 3 km radius.' },
          { status: 400 }
        );
      }

      const eligibility = checkDeliveryEligibility(
        Number(deliveryCoordinates.lat),
        Number(deliveryCoordinates.lng),
        DEFAULT_MAX_RADIUS_KM,
        SHOP_COORDINATES
      );

      if (!eligibility.eligible) {
        return NextResponse.json(
          {
            error: eligibility.reason || 'Your location is outside our 3 km delivery zone.',
            distanceKm: eligibility.distanceKm,
            outsideRadius: true,
          },
          { status: 400 }
        );
      }

      distanceKm = eligibility.distanceKm;
      deliveryFee = initialShopSettings.delivery_fee_rs;
    }

    // 3. Server-side Price & Subtotal Calculation (prevents client-side tampering)
    const productMap = new Map(initialProducts.map((p) => [p.id, p]));
    const dealMap = new Map(initialDeals.map((d) => [d.id, d]));

    let calculatedSubtotal = 0;
    const validatedOrderItems = [];

    for (const item of items) {
      let catalogItem = null;
      let isDeal = false;

      if (item.is_deal || item.deal_id) {
        catalogItem = dealMap.get(item.id) || dealMap.get(item.deal_id);
        isDeal = true;
      } else {
        catalogItem = productMap.get(item.id) || productMap.get(item.product_id);
      }

      if (!catalogItem) {
        return NextResponse.json(
          { error: `Item "${item.title || item.name}" not found in current menu.` },
          { status: 400 }
        );
      }

      if (!isDeal && catalogItem.is_available === false) {
        return NextResponse.json(
          { error: `"${catalogItem.name}" is currently sold out.` },
          { status: 400 }
        );
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const unitPrice = Number(catalogItem.price);
      const itemSubtotal = unitPrice * qty;

      calculatedSubtotal += itemSubtotal;

      validatedOrderItems.push({
        product_id: isDeal ? null : catalogItem.id,
        deal_id: isDeal ? catalogItem.id : null,
        item_title: catalogItem.name || catalogItem.title,
        unit_price: unitPrice,
        quantity: qty,
        subtotal_price: itemSubtotal,
        notes: item.notes || '',
      });
    }

    // Free delivery threshold check
    if (calculatedSubtotal >= initialShopSettings.free_delivery_threshold_rs) {
      deliveryFee = 0;
    }
    if (orderType === 'pickup') {
      deliveryFee = 0;
    }

    const totalAmount = calculatedSubtotal + deliveryFee;

    // Generate readable order number
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderNumber = `HBT-${dateStr}-${randomSuffix}`;
    const orderId = `ord_${Date.now()}_${randomSuffix}`;

    const newOrderRecord = {
      id: orderId,
      order_number: orderNumber,
      user_id: userId || null,
      order_type: orderType,
      status: 'Payment Pending',
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail?.trim() || null,
      delivery_address: orderType === 'delivery' ? deliveryAddress?.trim() : 'Self Pickup at Shop',
      delivery_lat: deliveryCoordinates?.lat ? Number(deliveryCoordinates.lat) : null,
      delivery_lng: deliveryCoordinates?.lng ? Number(deliveryCoordinates.lng) : null,
      distance_km: distanceKm,
      subtotal: calculatedSubtotal,
      delivery_fee: deliveryFee,
      total_amount: totalAmount,
      payment_status: 'pending',
      payment_method: paymentMethod || 'bank_transfer',
      payment_reference: paymentReference?.trim() || null,
      payment_proof_url: paymentProofUrl || null,
      special_instructions: specialInstructions?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: validatedOrderItems,
    };

    // 4. Persist to Supabase if configured
    const adminSupabase = createAdminClient();
    if (adminSupabase) {
      try {
        const { data: dbOrder, error: orderError } = await adminSupabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            user_id: userId || null,
            order_type: orderType,
            status: 'Payment Pending',
            customer_name: newOrderRecord.customer_name,
            customer_phone: newOrderRecord.customer_phone,
            customer_email: newOrderRecord.customer_email,
            delivery_address: newOrderRecord.delivery_address,
            delivery_lat: newOrderRecord.delivery_lat,
            delivery_lng: newOrderRecord.delivery_lng,
            distance_km: distanceKm,
            subtotal: calculatedSubtotal,
            delivery_fee: deliveryFee,
            total_amount: totalAmount,
            payment_status: 'pending',
            payment_method: newOrderRecord.payment_method,
            payment_reference: newOrderRecord.payment_reference,
            payment_proof_url: newOrderRecord.payment_proof_url,
            special_instructions: newOrderRecord.special_instructions,
          })
          .select()
          .single();

        if (orderError) {
          console.error('Supabase order insert error, using fallback:', orderError);
          addFallbackOrder(newOrderRecord);
        } else if (dbOrder) {
          newOrderRecord.id = dbOrder.id;

          // Insert order items
          const dbItems = validatedOrderItems.map((oi) => ({
            order_id: dbOrder.id,
            product_id: oi.product_id,
            deal_id: oi.deal_id,
            item_title: oi.item_title,
            unit_price: oi.unit_price,
            quantity: oi.quantity,
            subtotal_price: oi.subtotal_price,
            notes: oi.notes,
          }));

          await adminSupabase.from('order_items').insert(dbItems);

          // If payment submission provided
          if (paymentReference || paymentProofUrl) {
            await adminSupabase.from('payment_submissions').insert({
              order_id: dbOrder.id,
              user_id: userId || null,
              payment_method: newOrderRecord.payment_method,
              transaction_reference: paymentReference || 'Pending Reference',
              proof_image_url: paymentProofUrl || null,
              status: 'pending',
            });
          }
        }
      } catch (dbErr) {
        console.error('Database connection error during checkout:', dbErr);
        addFallbackOrder(newOrderRecord);
      }
    } else {
      // Supabase credentials not set yet; store in fallback store
      addFallbackOrder(newOrderRecord);
    }

    return NextResponse.json({
      success: true,
      orderId: newOrderRecord.id,
      orderNumber: newOrderRecord.order_number,
      totalAmount,
      subtotal: calculatedSubtotal,
      deliveryFee,
      orderType,
      status: 'Payment Pending',
    });
  } catch (error) {
    console.error('Checkout processing error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while placing your order. Please try again.' },
      { status: 500 }
    );
  }
}
