import React from 'react'
import { Button } from '@/components/ui/button'
import { Card } from './ui/card'
import { details } from './ItemDetails'
import link from 'next/link'

function MenuItems() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {ItemDetails.map((item) => (
            <Card key={item.id} className="bg-white rounded-lg m-auto opacity-80 px-5 py-7 hover:scale-105 hover:opacity-100 hover:shadow-2xl">
              {/* Use the item's picture dynamically */}
              <img src={item.pic} className="w-full h-48 object-cover rounded-t-lg" />
              
              {/* Title and Description */}
              <h2 className="text-2xl font-bold">{item.title}</h2>
              <h3>({item.genre})</h3>
              <p>{item.description}</p>
              
              {/* Display price if you want */}
              <p>Price: Rs. {item.price}</p>
    
              {/* Buttons */}
              <div className="space-x-2 mt-5">
                <Button className="hover:scale-110 hover:opacity-100">Add to Cart</Button>
                <Button className="hover:scale-110 hover:opacity-100">Buy Now</Button>
              </div>
            </Card>
          ))}
        </div>
      )
}

export default MenuItems